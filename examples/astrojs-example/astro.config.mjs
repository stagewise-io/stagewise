// @ts-check
import { defineConfig } from "astro/config";
import stagewiseIntegration from "./integrations/stagewise.mjs";

// https://astro.build/config
export default defineConfig({
  integrations: [
    // Stagewise toolbar integration with custom config
    stagewiseIntegration(),
  ],
});
