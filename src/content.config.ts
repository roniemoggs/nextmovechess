import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const learn = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/learn' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    category: z.string().default('Strategy & Analysis'),
    readTime: z.string().default('5 min read'),
    author: z.string().default('Next Move Chess Team'),
    featured: z.boolean().default(false),
  }),
});

export const collections = { learn };
