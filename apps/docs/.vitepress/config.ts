import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "Shelf Docs",
  description: "Documentación técnica del ecosistema descentralizado Shelf.",
  themeConfig: {
    nav: [
      { text: 'Inicio', link: '/' },
      { text: 'Arquitectura', link: '/arquitectura' },
      { text: 'Seguridad', link: '/seguridad' }
    ],
    sidebar: [
      {
        text: 'Guía Técnica',
        items: [
          { text: 'Introducción', link: '/' },
          { text: 'Arquitectura y P2P Mesh', link: '/arquitectura' },
          { text: 'Seguridad y PQC', link: '/seguridad' },
          { text: 'Sincronización CRDT (Yjs)', link: '/crdt' },
          { text: 'Gobernanza de Datos', link: '/gobernanza' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/tu-usuario/shelf' }
    ]
  }
})
