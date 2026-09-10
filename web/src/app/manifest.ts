import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Undercover — jeu du menteur en ligne entre amis',
    short_name: 'Undercover',
    description: "Trouve les infiltrés avant qu'ils ne te démasquent.",
    start_url: '/',
    display: 'standalone',
    background_color: '#12201a',
    theme_color: '#12201a',
    lang: 'fr',
    icons: [
      { src: '/icon', sizes: '64x64', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
