## 2024-10-24 - Avoid O(N) operations in memoized getters
**Learning:** A codebase-specific performance pattern in this React application is to avoid housing O(N) operations (like 'reduce' or 'filter') inside getter functions of memoized arrays, as they will still execute on every render when mapped.
**Action:** Instead, pre-calculate these totals directly inside the 'useMemo' block using standard 'for' loops to minimize garbage collection and array allocations.
