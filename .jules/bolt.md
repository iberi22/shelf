## 2024-05-18 - [Optimizing O(N) operations in getter functions]
**Learning:** A codebase-specific performance pattern in this React application is to avoid housing O(N) operations (like 'reduce' or 'filter') inside getter functions of memoized arrays, as they will still execute on every render when mapped.
**Action:** Pre-calculate these totals directly inside the 'useMemo' block using standard 'for' loops to minimize garbage collection and array allocations.
