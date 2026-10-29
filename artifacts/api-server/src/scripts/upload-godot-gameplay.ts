import { objectStorageClient, ObjectStorageService } from "../lib/objectStorage";
import path from "node:path";

const directory = new ObjectStorageService().getPublicObjectSearchPaths()[0];
if (!directory) throw new Error("Public asset storage is not configured.");
const [bucket, ...prefix] = directory.replace(/^\/+/, "").split("/");
for (const [source, name, contentType] of [
  ["godot-gameplay.mp4", "godot-gameplay-20261029.mp4", "video/mp4"],
  ["godot-gameplay.jpg", "godot-gameplay-20261029.jpg", "image/jpeg"],
]) {
  await objectStorageClient.bucket(bucket).upload(
    path.resolve("../../generated-artifacts", source),
    {
      destination: [...prefix, "desktop", name].join("/"),
      metadata: { contentType, cacheControl: "public, max-age=86400" },
    },
  );
  console.log(`/api/storage/public-objects/desktop/${name}`);
}
