<script lang="ts">
  import { currentRoute, router, routes } from './lib/router.svelte.ts';
  import BlogPage from './pages/BlogPage.svelte';
</script>

<div class="min-h-screen bg-[#121212] text-white flex">
  <!-- Sidebar Navigation -->
  <aside class="w-64 bg-[#1a1a1a] border-r border-white/10 p-4 space-y-6">
    <div class="flex items-center gap-2 px-2">
      <span class="text-2xl font-black text-[#4ADE80]">[ SWAL ]</span>
      <span class="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-300">Backoffice</span>
    </div>

    <nav class="space-y-1">
      <button
        on:click={() => router.navigate('/')}
        class="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-3 {$currentRoute === '/' ? 'bg-[#4ADE80]/15 text-[#4ADE80]' : 'text-gray-400 hover:bg-white/5 hover:text-white'}"
      >
        <span>📊</span> Dashboard
      </button>

      <button
        on:click={() => router.navigate('/nodes')}
        class="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-3 {$currentRoute === '/nodes' ? 'bg-[#4ADE80]/15 text-[#4ADE80]' : 'text-gray-400 hover:bg-white/5 hover:text-white'}"
      >
        <span>🌐</span> Nodos SWAL
      </button>

      <button
        on:click={() => router.navigate('/blog')}
        class="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-3 {$currentRoute === '/blog' ? 'bg-[#4ADE80]/15 text-[#4ADE80]' : 'text-gray-400 hover:bg-white/5 hover:text-white'}"
      >
        <span>📰</span> Blog & Noticias
      </button>
    </nav>
  </aside>

  <!-- Main View -->
  <main class="flex-1 overflow-y-auto">
    <svelte:component this={routes[$currentRoute] || BlogPage} />
  </main>
</div>
