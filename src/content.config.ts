import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const homepage = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/homepage",
  }),

  schema: z.object({
    churchName: z.string(),

    hero: z.object({
      eyebrow: z.string(),
      title: z.string(),
      subtitle: z.string(),
      text: z.string(),
      image: z.string(),
      visitButtonText: z.string(),
      sermonButtonText: z.string(),
    }),

    thisWeek: z.object({
  eyebrow: z.string(),
  heading: z.string(),
  text: z.string(),
  services: z.array(
    z.object({
      name: z.string(),
      day: z.string(),
      time: z.string(),
    })
  ),
  note: z.string(),
}),

mission: z.object({
  eyebrow: z.string(),
  heading: z.string(),
  text: z.string(),
  image: z.string(),
  buttonText: z.string(),
}),

firstVisit: z.object({
  eyebrow: z.string(),
  heading: z.string(),
  text: z.string(),
  items: z.array(
    z.object({
      title: z.string(),
      text: z.string(),
    })
  ),
  buttonText: z.string(),
  directionsUrl: z.string(),
}),
ministries: z.object({
  eyebrow: z.string(),
  heading: z.string(),
  text: z.string(),
  items: z.array(
    z.object({
      title: z.string(),
      text: z.string(),
      image: z.string(),
    })
  ),
}),

    contact: z.object({
      address: z.string(),
      cityStateZip: z.string(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
    }),

  giving: z.object({
  eyebrow: z.string(),
  heading: z.string(),
  text: z.string(),
  buttonText: z.string(),
  url: z.string(),
}),
  }),
});

const events = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/events",
  }),

  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    time: z.string(),
    location: z.string(),
    description: z.string(),
    image: z.string().optional(),
  }),
});

const meal = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/meal",
  }),
  schema: z.object({
    showMenu: z.boolean().default(true),
    title: z.string(),
    menu: z.string(),
    note: z.string().optional(),
  }),
});

export const collections = {
  homepage,
  events,
  meal,
};
