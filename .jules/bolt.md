## 2024-05-24 - Pre-calculate O(N) operations in useMemo instead of getter functions
**Learning:** A codebase-specific anti-pattern is housing O(N) operations (like `reduce` or `filter`) inside getter functions of memoized arrays (like `getValue: () => ...`). These getters execute on every render when the array is mapped, defeating the purpose of memoizing the array structure.
**Action:** Pre-calculate these totals directly inside the `useMemo` block using standard `for` loops to minimize garbage collection and array allocations.
