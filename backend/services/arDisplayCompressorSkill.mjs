import { createArDisplay } from "./arDisplayService.mjs";

export async function petArDisplayCompressor(analysis) {
  return {
    skill: "pet-ar-display-compressor",
    ...createArDisplay(analysis)
  };
}
