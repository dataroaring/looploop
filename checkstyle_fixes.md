# CheckStyle Fixes for PR #61511

## Identified Issues and Solutions:

### 1. Line Length Issues
Some lines might exceed the maximum line length limit (typically 120 chars).

**In DynamicPartitionUtil.java:**
```java
// Current (potentially too long):
} else if (expectCreatePartitionNum > Config.max_dynamic_partition_num * 0.8) {
    LOG.warn("Dynamic partition count {} is approaching limit {} (>80%)."
                    + " Consider increasing max_dynamic_partition_num.",
            expectCreatePartitionNum, Config.max_dynamic_partition_num);

// Fixed:
} else if (expectCreatePartitionNum > Config.max_dynamic_partition_num * 0.8) {
    LOG.warn("Dynamic partition count {} is approaching limit {} (>80%). "
                    + "Consider increasing max_dynamic_partition_num.",
            expectCreatePartitionNum, Config.max_dynamic_partition_num);
```

**In FrontendServiceImpl.java:**
```java
// Current:
} else if (partitionNum > autoPartitionLimit * 0.8) {
    LOG.warn("Table {}.{} auto partition count {} is approaching limit {} (>80%)."
                    + " Consider increasing max_auto_partition_num.",
            db.getFullName(), olapTable.getName(), partitionNum, autoPartitionLimit);

// Fixed:
} else if (partitionNum > autoPartitionLimit * 0.8) {
    LOG.warn("Table {}.{} auto partition count {} is approaching limit {} (>80%). "
                    + "Consider increasing max_auto_partition_num.",
            db.getFullName(), olapTable.getName(), partitionNum, autoPartitionLimit);
```

### 2. Import Order Issues
Check if imports are in the correct order (should be alphabetical within groups).

### 3. Javadoc Issues
New metrics might need proper Javadoc comments:

```java
/**
 * Counter for auto partition near-limit warnings.
 */
public static LongCounterMetric COUNTER_AUTO_PARTITION_NEAR_LIMIT;

/**
 * Counter for dynamic partition near-limit warnings.
 */
public static LongCounterMetric COUNTER_DYNAMIC_PARTITION_NEAR_LIMIT;
```

### 4. Magic Number Issue
The hardcoded 0.8 should be a named constant:

```java
// Add to Config.java:
private static final double PARTITION_WARNING_THRESHOLD = 0.8;

// Then use:
} else if (expectCreatePartitionNum > Config.max_dynamic_partition_num * PARTITION_WARNING_THRESHOLD) {
```

## Commands to Run:

1. **Run CheckStyle locally:**
```bash
./build.sh --fe --checkstyle
```

2. **Auto-format code:**
```bash
./build.sh --fe --format
```

3. **Check specific files:**
```bash
checkstyle -c checkstyle.xml fe/fe-common/src/main/java/org/apache/doris/common/Config.java
```