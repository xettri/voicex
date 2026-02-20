import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid(
  defineConfig({
    title: 'Voicex',
    description: 'Real-time AI voice agent platform — build, deploy, and manage AI voice agents',
    srcDir: 'src',
    base: process.env.DOCS_BASE || '/',
    ignoreDeadLinks: true,
    head: [['link', { rel: 'icon', href: '/favicon.ico' }]],
    themeConfig: {
      logo: '/logo.svg',
      siteTitle: 'Voicex',
      nav: [
        { text: 'Guide', link: '/getting-started' },
        { text: 'API', link: '/rest-api' },
        { text: 'Architecture', link: '/architecture' },
        { text: 'Deploy', link: '/deployment' },
      ],
      sidebar: [
        {
          text: 'Introduction',
          items: [
            { text: 'What is Voicex?', link: '/' },
            { text: 'Getting Started', link: '/getting-started' },
            { text: 'Architecture', link: '/architecture' },
            { text: 'Database Schema', link: '/database' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Authentication', link: '/authentication' },
            { text: 'Providers', link: '/providers' },
            { text: 'Plans & Billing', link: '/plans-and-billing' },
          ],
        },
        {
          text: 'Frontend',
          items: [
            { text: 'Frontend Architecture', link: '/frontend' },
          ],
        },
        {
          text: 'API Reference',
          items: [
            { text: 'REST API', link: '/rest-api' },
            { text: 'WebSocket API', link: '/websocket-api' },
            { text: 'Client Integration', link: '/client-integration' },
            { text: 'Twilio (Phone)', link: '/twilio' },
          ],
        },
        {
          text: 'Operations',
          items: [
            { text: 'Environment Variables', link: '/environment' },
            { text: 'Deployment', link: '/deployment' },
            { text: 'Admin Scripts', link: '/admin-scripts' },
          ],
        },
      ],
      socialLinks: [{ icon: 'github', link: 'https://github.com/your-org/voicex' }],
      footer: {
        message: 'Built with Deepgram, Groq, and ElevenLabs.',
        copyright: 'Voicex',
      },
      search: {
        provider: 'local',
      },
      outline: {
        level: [2, 3],
      },
    },
  }),
);
