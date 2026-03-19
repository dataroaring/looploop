import { trace, context, SpanStatusCode, type Span, type Tracer } from "@opentelemetry/api";
import { NodeTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import fs from "node:fs";
import path from "node:path";
import type { ContextStats } from "./types.js";

// ── In-memory metrics (single-process CLI, no need for full OTel metrics SDK) ──

const metrics = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCost: 0,
  messageCount: 0,
  toolCalls: {} as Record<string, number>,
  activeSkills: new Set<string>(),
  compressionEvents: 0,
  llmCalls: 0,
  totalLatencyMs: 0,
};

// ── Trace file exporter (writes OTLP JSON to .looploop/traces/) ──

const TRACES_DIR = path.resolve(".looploop/traces");

class FileTraceExporter {
  private spans: any[] = [];

  export(spans: any[], resultCallback: (result: { code: number }) => void) {
    for (const span of spans) {
      this.spans.push({
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        parentSpanId: span.parentSpanId,
        name: span.name,
        kind: span.kind,
        startTime: span.startTime,
        endTime: span.endTime,
        duration: span.duration,
        status: span.status,
        attributes: span.attributes,
        events: span.events,
      });
    }
    this.flush(resultCallback);
  }

  flush(resultCallback?: (result: { code: number }) => void) {
    if (this.spans.length === 0) {
      resultCallback?.({ code: 0 });
      return;
    }
    fs.mkdirSync(TRACES_DIR, { recursive: true });
    const filename = `trace-${Date.now()}.json`;
    fs.writeFileSync(
      path.join(TRACES_DIR, filename),
      JSON.stringify({ resourceSpans: this.spans }, null, 2),
    );
    this.spans = [];
    resultCallback?.({ code: 0 });
  }

  shutdown(): Promise<void> {
    this.flush();
    return Promise.resolve();
  }
}

// ── OTel initialization ──

let tracer: Tracer;
let provider: NodeTracerProvider;
let fileExporter: FileTraceExporter;

export function initTelemetry() {
  const resource = resourceFromAttributes({ "service.name": "looploop" });
  fileExporter = new FileTraceExporter();

  const spanProcessors: SimpleSpanProcessor[] = [
    new SimpleSpanProcessor(fileExporter as any),
  ];

  // Optional: remote OTLP exporter
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (otlpEndpoint) {
    spanProcessors.push(new SimpleSpanProcessor(new OTLPTraceExporter({ url: otlpEndpoint })));
  }

  provider = new NodeTracerProvider({ resource, spanProcessors });
  provider.register();
  tracer = trace.getTracer("looploop");
}

export function shutdownTelemetry() {
  fileExporter?.flush();
  provider?.shutdown();
}

// ── Trace/Span helpers ──

export function startTrace(name: string, attributes?: Record<string, string>): Span {
  return tracer.startSpan(name, { attributes });
}

export function startSpan(name: string, parent: Span, attributes?: Record<string, any>): Span {
  const ctx = trace.setSpan(context.active(), parent);
  return tracer.startSpan(name, { attributes }, ctx);
}

export function endSpan(span: Span, error?: string) {
  if (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}

// ── Metric helpers ──

export function recordLlmCall(inputTokens: number, outputTokens: number, cost: number, latencyMs: number) {
  metrics.totalInputTokens += inputTokens;
  metrics.totalOutputTokens += outputTokens;
  metrics.totalCost += cost;
  metrics.llmCalls++;
  metrics.totalLatencyMs += latencyMs;
}

export function recordToolCall(toolName: string) {
  metrics.toolCalls[toolName] = (metrics.toolCalls[toolName] || 0) + 1;
}

export function recordMessage() {
  metrics.messageCount++;
}

export function recordSkillActivation(skillName: string) {
  metrics.activeSkills.add(skillName);
}

export function recordCompression() {
  metrics.compressionEvents++;
}

/** Rebuild metrics from loaded messages (after /load) */
export function rebuildMetrics(messages: any[]) {
  metrics.totalInputTokens = 0;
  metrics.totalOutputTokens = 0;
  metrics.totalCost = 0;
  metrics.messageCount = messages.length;
  metrics.toolCalls = {};
  metrics.activeSkills = new Set<string>();
  metrics.compressionEvents = 0;
  metrics.llmCalls = 0;
  metrics.totalLatencyMs = 0;

  for (const msg of messages) {
    if (!msg || !("role" in msg)) continue;

    if (msg.role === "assistant" && msg.usage) {
      metrics.llmCalls++;
      metrics.totalInputTokens += (msg.usage.input ?? 0) + (msg.usage.cacheRead ?? 0);
      metrics.totalOutputTokens += msg.usage.output ?? 0;
      metrics.totalCost += msg.usage.cost?.total ?? 0;
    }

    if (msg.role === "toolResult" && msg.toolName) {
      metrics.toolCalls[msg.toolName] = (metrics.toolCalls[msg.toolName] || 0) + 1;
    }
  }
}

export function getContextStats(): ContextStats {
  return {
    totalInputTokens: metrics.totalInputTokens,
    totalOutputTokens: metrics.totalOutputTokens,
    totalCost: metrics.totalCost,
    messageCount: metrics.messageCount,
    toolCalls: { ...metrics.toolCalls },
    activeSkills: [...metrics.activeSkills],
    compressionEvents: metrics.compressionEvents,
    avgLatencyMs: metrics.llmCalls > 0 ? Math.round(metrics.totalLatencyMs / metrics.llmCalls) : 0,
    llmCalls: metrics.llmCalls,
  };
}
