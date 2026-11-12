import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { GET, PUT } from "./route";
let root: string;
const previous = process.env.OPENCUT_CLOUD_DIR;
const context = { params: Promise.resolve({ projectId: "test", mediaId: "sample" }) };
beforeAll(async () => {
 root = await mkdtemp(path.join(tmpdir(), "opencut-media-test-"));
 process.env.OPENCUT_CLOUD_DIR = root;
 await mkdir(path.join(root, "media-pool"));
 await writeFile(path.join(root, "media-pool", "sample"), "0123456789");
});
afterAll(async () => {
 if (previous === undefined) delete process.env.OPENCUT_CLOUD_DIR;
 else process.env.OPENCUT_CLOUD_DIR = previous;
 await rm(root, { recursive: true });
});
test("downloads complete original", async () => {
 const response = await GET(new NextRequest("http://localhost/media"), context);
 expect(response.status).toBe(200);
 expect(response.headers.get("content-length")).toBe("10");
 expect(await response.text()).toBe("0123456789");
});
for (const [range, expected, contentRange] of [
 ["bytes=2-5", "2345", "bytes 2-5/10"], ["bytes=7-", "789", "bytes 7-9/10"],
 ["bytes=-3", "789", "bytes 7-9/10"], ["bytes=8-100", "89", "bytes 8-9/10"],
]) test(range, async () => {
 const response = await GET(new NextRequest("http://localhost/media", { headers: { range } }), context);
 expect(response.status).toBe(206);
 expect(response.headers.get("content-range")).toBe(contentRange);
 expect(await response.text()).toBe(expected);
});
for (const range of ["bytes=50-", "bytes=5-2", "bytes=-0", "bytes=", "bytes=0-1,4-5"]) {
 test(`rejects ${range}`, async () => {
  const response = await GET(new NextRequest("http://localhost/media", { headers: { range } }), context);
  expect(response.status).toBe(416);
 });
}

test("HTTP upload rejects an absent chunk instead of publishing zeros", async () => {
 const ctx={params:Promise.resolve({projectId:"test",mediaId:"missing-chunk"})};
 const response=await PUT(new NextRequest("http://localhost/media?offset=4&done=1&totalSize=8",{method:"PUT",body:"efgh"}),ctx);
 expect(response.status).toBe(409);
 expect((await GET(new NextRequest("http://localhost/media"),ctx)).status).toBe(404);
});
test("HTTP upload only publishes a complete contiguous media file", async () => {
 const ctx={params:Promise.resolve({projectId:"test",mediaId:"complete-chunks"})};
 expect((await PUT(new NextRequest("http://localhost/media?offset=0&done=0&totalSize=8",{method:"PUT",body:"abcd"}),ctx)).status).toBe(200);
 expect((await GET(new NextRequest("http://localhost/media"),ctx)).status).toBe(404);
 expect((await PUT(new NextRequest("http://localhost/media?offset=4&done=1&totalSize=8",{method:"PUT",body:"efgh"}),ctx)).status).toBe(200);
 expect(await (await GET(new NextRequest("http://localhost/media"),ctx)).text()).toBe("abcdefgh");
});
