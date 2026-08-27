<script lang="ts">
  import { onMount } from 'svelte';

  export interface BlogPost {
    id: string;
    title: string;
    slug: string;
    summary: string;
    content: string; // Markdown formatted
    author: string;
    tags: string[];
    published: boolean;
    createdAt: string;
    updatedAt: string;
  }

  let posts: BlogPost[] = [];
  let searchQuery = '';
  let filterTag = 'all';
  let isEditing = false;
  let showPreview = false;

  let currentPost: BlogPost = {
    id: '',
    title: '',
    slug: '',
    summary: '',
    content: '',
    author: 'Equipo SWAL',
    tags: ['ecosistema'],
    published: true,
    createdAt: '',
    updatedAt: ''
  };

  const XAVIER_BLOG_PATH = 'user/blog-posts';

  async function loadPosts() {
    try {
      // Fetch from Xavier Memory if window.xavier exists or fallback to localStorage
      if (typeof window !== 'undefined' && (window as any).xavierSearch) {
        const results = await (window as any).xavierSearch('blog-post', { path: XAVIER_BLOG_PATH });
        posts = results.map((r: any) => JSON.parse(r.content) as BlogPost);
      } else {
        const stored = localStorage.getItem('swal_blog_posts');
        posts = stored ? JSON.parse(stored) : getInitialPosts();
      }
    } catch (error) {
      console.warn('Xavier memory offline, using local fallback:', error);
      const stored = localStorage.getItem('swal_blog_posts');
      posts = stored ? JSON.parse(stored) : getInitialPosts();
    }
  }

  function getInitialPosts(): BlogPost[] {
    return [
      {
        id: '1',
        title: 'Bienvenido al Ecosistema Maloca & SWAL',
        slug: 'bienvenido-ecosistema-swal',
        summary: 'Noticias y actualizaciones sobre la red P2P descentralizada.',
        content: '# Ecosistema SWAL\n\nBienvenido a las noticias del ecosistema. SWAL integra inventarios offline-first, **red mesh P2P** y computación en el borde.',
        author: 'Equipo SWAL',
        tags: ['ecosistema'],
        published: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
  }

  async function persistPosts() {
    localStorage.setItem('swal_blog_posts', JSON.stringify(posts));
    if (typeof window !== 'undefined' && (window as any).xavierAdd) {
      try {
        await (window as any).xavierAdd(
          JSON.stringify(currentPost),
          { path: `${XAVIER_BLOG_PATH}/${currentPost.id}`, tags: ['blog-post', ...currentPost.tags] }
        );
      } catch (err) {
        console.warn('Could not sync post to Xavier memory:', err);
      }
    }
  }

  onMount(async () => {
    await loadPosts();
  });

  function handleCreateNew() {
    currentPost = {
      id: crypto.randomUUID(),
      title: '',
      slug: '',
      summary: '',
      content: '',
      author: 'Admin SWAL',
      tags: ['actualización'],
      published: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    isEditing = true;
    showPreview = false;
  }

  function handleEdit(post: BlogPost) {
    currentPost = { ...post };
    isEditing = true;
    showPreview = false;
  }

  async function handleDelete(id: string) {
    if (confirm('¿Estás seguro de eliminar este artículo del blog?')) {
      posts = posts.filter(p => p.id !== id);
      localStorage.setItem('swal_blog_posts', JSON.stringify(posts));
      if (typeof window !== 'undefined' && (window as any).xavierDelete) {
        try {
          await (window as any).xavierDelete(`${XAVIER_BLOG_PATH}/${id}`);
        } catch (err) {
          console.warn('Could not delete post from Xavier memory:', err);
        }
      }
    }
  }

  async function handleSave() {
    if (!currentPost.title.trim()) {
      alert('El título es requerido');
      return;
    }
    if (!currentPost.slug.trim()) {
      currentPost.slug = currentPost.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }

    const index = posts.findIndex(p => p.id === currentPost.id);
    if (index >= 0) {
      posts[index] = { ...currentPost, updatedAt: new Date().toISOString() };
      posts = [...posts];
    } else {
      posts = [{ ...currentPost, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...posts];
    }

    await persistPosts();
    isEditing = false;
  }

  // Sanitized Markdown parser for rendering content previews
  function renderMarkdown(md: string): string {
    if (!md) return '';
    const safe = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return safe
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold text-white mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold text-[#4ADE80] mt-6 mb-3">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-extrabold text-[#4ADE80] mt-6 mb-4">$1</h1>')
      .replace(/\*\*(.*)\*\*/gim, '<strong class="font-bold text-white">$1</strong>')
      .replace(/\*(.*)\*/gim, '<em class="italic">$1</em>')
      .replace(/\[(.*?)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-green-400 underline">$1</a>')
      .replace(/\n\n/g, '</p><p class="mt-3">')
      .replace(/\n/g, '<br />');
  }

  $: filteredPosts = posts.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = filterTag === 'all' || p.tags.includes(filterTag);
    return matchesSearch && matchesTag;
  });
</script>

<div class="p-6 max-w-7xl mx-auto space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between border-b border-white/10 pb-4">
    <div>
      <h1 class="text-2xl font-bold text-white flex items-center gap-2">
        <span class="text-[#4ADE80]">📰</span> Blog del Ecosistema Maloca
      </h1>
      <p class="text-sm text-gray-400">Gestiona las noticias, notas de versión y actualizaciones de SWAL.</p>
    </div>
    <button
      on:click={handleCreateNew}
      class="bg-[#4ADE80] hover:bg-[#22C55E] text-[#161616] font-bold px-4 py-2 rounded-lg transition-all text-sm flex items-center gap-2 shadow-lg"
    >
      <span>+</span> Nuevo Artículo
    </button>
  </div>

  {#if isEditing}
    <!-- Post Editor Form -->
    <div class="bg-[#1a1a1a] border border-white/10 rounded-xl p-6 space-y-4 shadow-2xl">
      <div class="flex items-center justify-between border-b border-white/10 pb-3">
        <h2 class="text-lg font-bold text-white">
          {currentPost.id ? 'Editar Artículo' : 'Crear Nuevo Artículo'}
        </h2>
        <div class="flex items-center gap-2">
          <button
            on:click={() => showPreview = !showPreview}
            class="px-3 py-1.5 text-xs font-semibold rounded-md border border-white/20 text-gray-300 hover:bg-white/10"
          >
            {showPreview ? '✏️ Modo Editor' : '👁️ Vista Previa Markdown'}
          </button>
          <button
            on:click={() => isEditing = false}
            class="text-gray-400 hover:text-white px-2 py-1"
          >
            ✕
          </button>
        </div>
      </div>

      {#if showPreview}
        <div class="bg-[#121212] border border-white/10 rounded-lg p-6 text-gray-200 prose prose-invert max-w-none">
          <h1 class="text-2xl font-bold text-[#4ADE80]">{currentPost.title || 'Título del Artículo'}</h1>
          <div class="text-xs text-gray-400 my-2">Por {currentPost.author} • {new Date().toLocaleDateString()}</div>
          <div class="mt-4">
            {@html renderMarkdown(currentPost.content)}
          </div>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label for="post-title" class="block text-xs font-medium text-gray-400 mb-1">Título</label>
            <input
              id="post-title"
              type="text"
              bind:value={currentPost.title}
              placeholder="Ej: Lanzamiento de SWAL v1.0"
              class="w-full bg-[#121212] border border-white/20 rounded-md p-2.5 text-sm text-white focus:outline-none focus:border-[#4ADE80]"
            />
          </div>
          <div>
            <label for="post-slug" class="block text-xs font-medium text-gray-400 mb-1">Slug URL</label>
            <input
              id="post-slug"
              type="text"
              bind:value={currentPost.slug}
              placeholder="lanzamiento-swal-v1"
              class="w-full bg-[#121212] border border-white/20 rounded-md p-2.5 text-sm text-white focus:outline-none focus:border-[#4ADE80]"
            />
          </div>
          <div>
            <label for="post-author" class="block text-xs font-medium text-gray-400 mb-1">Autor</label>
            <input
              id="post-author"
              type="text"
              bind:value={currentPost.author}
              class="w-full bg-[#121212] border border-white/20 rounded-md p-2.5 text-sm text-white focus:outline-none focus:border-[#4ADE80]"
            />
          </div>
          <div>
            <label for="post-tags" class="block text-xs font-medium text-gray-400 mb-1">Etiquetas (separadas por coma)</label>
            <input
              id="post-tags"
              type="text"
              value={currentPost.tags.join(', ')}
              on:input={(e) => currentPost.tags = e.currentTarget.value.split(',').map(t => t.trim())}
              placeholder="actualización, release, p2p"
              class="w-full bg-[#121212] border border-white/20 rounded-md p-2.5 text-sm text-white focus:outline-none focus:border-[#4ADE80]"
            />
          </div>
        </div>

        <div>
          <label for="post-summary" class="block text-xs font-medium text-gray-400 mb-1">Resumen Corto</label>
          <input
            id="post-summary"
            type="text"
            bind:value={currentPost.summary}
            placeholder="Breve resumen del artículo para la vista previa..."
            class="w-full bg-[#121212] border border-white/20 rounded-md p-2.5 text-sm text-white focus:outline-none focus:border-[#4ADE80]"
          />
        </div>

        <div>
          <label for="post-content" class="block text-xs font-medium text-gray-400 mb-1">Contenido (Soporta Markdown)</label>
          <textarea
            id="post-content"
            bind:value={currentPost.content}
            rows="10"
            placeholder="# Encabezado principal&#10;&#10;Escribe tu artículo en Markdown aquí..."
            class="w-full bg-[#121212] border border-white/20 rounded-md p-3 text-sm text-white focus:outline-none focus:border-[#4ADE80] font-mono"
          ></textarea>
        </div>
      {/if}

      <div class="flex justify-end gap-3 pt-4 border-t border-white/10">
        <button
          on:click={() => isEditing = false}
          class="px-4 py-2 text-sm text-gray-400 hover:text-white"
        >
          Cancelar
        </button>
        <button
          on:click={handleSave}
          class="bg-[#4ADE80] hover:bg-[#22C55E] text-[#161616] font-bold px-6 py-2 rounded-lg text-sm transition-all"
        >
          Guardar Artículo
        </button>
      </div>
    </div>
  {:else}
    <!-- Filters & Search -->
    <div class="flex flex-col sm:flex-row gap-4 items-center justify-between bg-[#1a1a1a] p-4 rounded-xl border border-white/10">
      <input
        type="search"
        bind:value={searchQuery}
        placeholder="Buscar artículos por título o contenido..."
        class="w-full sm:w-80 bg-[#121212] border border-white/20 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-[#4ADE80]"
      />
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-400">Filtrar por:</span>
        <select
          bind:value={filterTag}
          class="bg-[#121212] border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
        >
          <option value="all">Todas las etiquetas</option>
          <option value="ecosistema">Ecosistema</option>
          <option value="actualización">Actualización</option>
          <option value="release">Release</option>
        </select>
      </div>
    </div>

    <!-- Posts Grid -->
    {#if filteredPosts.length === 0}
      <div class="text-center py-12 bg-[#1a1a1a] rounded-xl border border-white/10 text-gray-400">
        <p class="text-lg">No se encontraron artículos.</p>
        <p class="text-xs text-gray-500 mt-1">Crea el primer artículo haciendo clic en "Nuevo Artículo".</p>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {#each filteredPosts as post (post.id)}
          <div class="bg-[#1a1a1a] border border-white/10 hover:border-[#4ADE80]/40 rounded-xl p-5 flex flex-col justify-between transition-all hover:shadow-lg">
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs px-2.5 py-0.5 rounded-full bg-[#4ADE80]/10 text-[#4ADE80] border border-[#4ADE80]/30 font-semibold">
                  {post.tags[0] || 'General'}
                </span>
                <span class="text-xs text-gray-400">
                  {new Date(post.createdAt).toLocaleDateString()}
                </span>
              </div>
              <h3 class="text-lg font-bold text-white mb-2 line-clamp-2">{post.title}</h3>
              <p class="text-sm text-gray-400 mb-4 line-clamp-3">{post.summary || post.content.slice(0, 120) + '...'}</p>
            </div>
            <div class="pt-4 border-t border-white/10 flex items-center justify-between">
              <span class="text-xs text-gray-500">Por {post.author}</span>
              <div class="flex gap-2">
                <button
                  on:click={() => handleEdit(post)}
                  class="text-xs px-2.5 py-1 bg-white/5 hover:bg-white/10 text-yellow-400 rounded-md transition-all"
                >
                  Editar
                </button>
                <button
                  on:click={() => handleDelete(post.id)}
                  class="text-xs px-2.5 py-1 bg-white/5 hover:bg-white/10 text-red-400 rounded-md transition-all"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
