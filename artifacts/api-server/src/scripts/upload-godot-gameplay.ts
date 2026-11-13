import { objectStorageClient, ObjectStorageService } from "../lib/objectStorage";
import path from "node:path";

const directory = new ObjectStorageService().getPublicObjectSearchPaths()[0];
if (!directory) throw new Error("Public asset storage is not configured.");
const [bucket, ...prefix] = directory.replace(/^\/+/, "").split("/");
for (const [source, name, contentType] of [
  ["godot-gameplay-lobby.webm", "godot-gameplay-lobby-20261113.webm", "video/webm"],
  ["godot-gameplay-lobby.mp4", "godot-gameplay-lobby-20261113.mp4", "video/mp4"],
  ["godot-gameplay-lobby.jpg", "godot-gameplay-lobby-20261113.jpg", "image/jpeg"],
  ["godot-gameplay-temple.webm", "godot-gameplay-temple-20261113.webm", "video/webm"],
  ["godot-gameplay-temple.mp4", "godot-gameplay-temple-20261113.mp4", "video/mp4"],
  ["godot-gameplay-temple.jpg", "godot-gameplay-temple-20261113.jpg", "image/jpeg"],
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
