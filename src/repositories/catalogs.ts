import { db } from "../storage/db";
import { instructions } from "../utils";
export async function ensureCatalogs() {
  await db.transaction(
    "rw",
    [db.catalogs, db.letters, db.settings],
    async () => {
      if (await db.catalogs.count()) return;
      const letters = await db.letters.toArray();
      const extras =
        (await db.settings.get("main"))?.extraInstructions
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean) || [];
      const values = {
        kind: [
          "Surat dinas",
          "Undangan",
          "Nota dinas",
          ...letters.map((l) => l.kind),
        ],
        urgency: [
          "Biasa",
          "Segera",
          "Sangat segera",
          ...letters.map((l) => l.urgency),
        ],
        classification: [
          "Biasa",
          "Terbatas",
          "Rahasia",
          ...letters.map((l) => l.classification),
        ],
        instruction: [...instructions, ...extras],
      };
      for (const [category, names] of Object.entries(values))
        await db.catalogs.bulkAdd(
          [...new Set(names)].map((name, order) => ({
            id: `${category}-${order}`,
            category: category as
              "kind" | "urgency" | "classification" | "instruction",
            name,
            active: true,
            order,
          })),
        );
    },
  );
}
