import { parentPort } from "worker_threads";
import { SupernoteX, toImage } from "supernote-typescript";

parentPort?.on("message", async ({ noteBuffer, pageIndex }) => {
  try {
    const note = new SupernoteX(noteBuffer);
    const [image] = await toImage(note, [pageIndex + 1]);
    const buffer = await image.toBuffer({ format: "png" });

    parentPort?.postMessage({
      status: "success",
      pageIndex,
      buffer,
      width: image.width,
      height: image.height,
    });
  } catch (error) {
    parentPort?.postMessage({
      status: "error",
      pageIndex,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    process.exit(0); // Ensure the worker terminates
  }
});
