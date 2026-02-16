import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

export default withMermaid(
  defineConfig({
    title: "Voicex",
    description: "Real-time AI voice assistant platform",
    srcDir: "src",
    ignoreDeadLinks: true,
    head: [["link", { rel: "icon", href: "/favicon.ico" }]],
    themeConfig: {
      logo: "/logo.svg",
      siteTitle: "Voicex",
      nav: [
        { text: "Guide", link: "/getting-started" },
        { text: "API", link: "/websocket-api" },
        { text: "Providers", link: "/providers" },
        { text: "Deploy", link: "/deployment" },
      ],
      sidebar: [
        {
          text: "Introduction",
          items: [
            { text: "What is Voicex?", link: "/" },
            { text: "Getting Started", link: "/getting-started" },
            { text: "Architecture", link: "/architecture" },
          ],
        },
        {
          text: "Configuration",
          items: [
            { text: "Environment Variables", link: "/environment" },
            { text: "Providers (STT/LLM/TTS)", link: "/providers" },
          ],
        },
        {
          text: "Integration",
          items: [
            { text: "WebSocket API", link: "/websocket-api" },
            { text: "Client Integration", link: "/client-integration" },
            { text: "Twilio (Phone)", link: "/twilio" },
          ],
        },
        {
          text: "Production",
          items: [
            { text: "Deployment", link: "/deployment" },
            { text: "Pricing & Costs", link: "/pricing" },
          ],
        },
      ],
      socialLinks: [
        { icon: "github", link: "https://github.com/your-org/voicex" },
      ],
      footer: {
        message: "Built with Deepgram, Groq, and ElevenLabs.",
        copyright: "Voicex",
      },
      search: {
        provider: "local",
      },
      outline: {
        level: [2, 3],
      },
    },
  })
);
