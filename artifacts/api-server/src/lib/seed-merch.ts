import { db } from "@workspace/db";
import { merchProductsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const INITIAL_PRODUCTS = [
  {
    name: "PABLO CORP OPERATIVE TEE",
    description: "Heavy cotton crew-neck tee. PABLO CORP logo on front, 'MINX CITY OPERATIVE' on back. Pre-washed. Built for long shifts.",
    price: 3500,
    images: [
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80"
    ],
    sizes: ["S", "M", "L", "XL", "2XL"],
    category: "apparel",
    sortOrder: 1,
  },
  {
    name: "MINX CITY HOODIE",
    description: "Heavyweight pullover hoodie. Embroidered MINX CITY cityscape on front. PABLO CORP stamp on left sleeve. Stays warm in the wasteland.",
    price: 6500,
    images: [
      "https://images.unsplash.com/photo-1556821840-3a63f15732ce?w=800&q=80"
    ],
    sizes: ["S", "M", "L", "XL", "2XL"],
    category: "apparel",
    sortOrder: 2,
  },
  {
    name: "SALARYMAN STICKER PACK",
    description: "5 vinyl die-cut stickers: PABLO CORP logo, MINX CITY skyline, OPERATIVE badge, FIAT symbol, and the Shadow Tower. Weatherproof. Perfect for devices and laptops.",
    price: 1000,
    images: [
      "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&q=80"
    ],
    sizes: [],
    category: "accessories",
    sortOrder: 3,
  },
  {
    name: "PABLO CORP POSTER — SHADOW TOWER",
    description: "18×24\" high-quality matte print of the Shadow Tower at night. Neon green on black. Numbered edition. Ships rolled in protective tube.",
    price: 2500,
    images: [
      "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=800&q=80"
    ],
    sizes: [],
    category: "prints",
    sortOrder: 4,
  },
  {
    name: "OPERATIVE CAP",
    description: "6-panel structured cap. Embroidered PABLO CORP crest on front. Adjustable snapback. One size fits most.",
    price: 3000,
    images: [
      "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=800&q=80"
    ],
    sizes: ["ONE SIZE"],
    category: "apparel",
    sortOrder: 5,
  },
  {
    name: "MINX CITY MAP POSTER",
    description: "24×36\" detailed city map of Minx City — all districts, gang territories, landmarks, and transit lines. Matte print. Ships rolled.",
    price: 3000,
    images: [
      "https://images.unsplash.com/photo-1524661135-423995f22d0b?w=800&q=80"
    ],
    sizes: [],
    category: "prints",
    sortOrder: 6,
  },
];

export async function seedMerchProducts() {
  const existing = await db.select({ id: merchProductsTable.id }).from(merchProductsTable).limit(1);
  if (existing.length > 0) {
    console.log("[Merch Seed] Products already exist, skipping seed.");
    return;
  }

  await db.insert(merchProductsTable).values(INITIAL_PRODUCTS);
  console.log(`[Merch Seed] Inserted ${INITIAL_PRODUCTS.length} products.`);
}
