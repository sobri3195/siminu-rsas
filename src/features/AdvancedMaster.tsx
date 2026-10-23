import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import { useApp } from "../app/context";
import { Field, Modal, Badge } from "../components/common";
import { id } from "../utils";
import { z } from "zod";
const masterSchema = z
  .object({ id: z.string(), name: z.string().min(1), active: z.boolean() })
  .passthrough();
export function AdvancedMaster() {
  const { run } = useApp();
  const [section, setSection] = useState<"users" | "positions" | "catalogs">(
    "catalogs",
  );
  const rows = useLiveQuery(() => db.table(section).toArray(), [section]) || [];
  const units = useLiveQuery(() => db.units.toArray()) || [];
  const users = useLiveQuery(() => db.users.toArray()) || [];
  const [draft, setDraft] =
    useState<Record<string, string | boolean | number>>();
  const write = (key: string, value: string | boolean | number) =>
    draft && setDraft({ ...draft, [key]: value });
  return (
    <section className="panel master-extra">
      <div className="section-title">
        <h2>Jabatan, pengguna simulasi & kamus naskah</h2>
        <button
          onClick={() =>
            setDraft({
              id: id(),
              name: "",
              active: true,
              unitId: units[0]?.id || "",
              role: "Pelaksana",
              category: "kind",
              order: rows.length,
            })
          }
        >
          Tambah data master
        </button>
      </div>
      <div className="toolbar">
        <Field label="Kelompok master">
          <select
            value={section}
            onChange={(e) => {
              setSection(e.target.value as typeof section);
              setDraft(undefined);
            }}
          >
            <option value="catalogs">
              Jenis, derajat, klasifikasi, instruksi
            </option>
            <option value="positions">Jabatan</option>
            <option value="users">Pengguna simulasi</option>
          </select>
        </Field>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Kelompok / unit</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>
                  {section === "catalogs"
                    ? row.category
                    : units.find((u) => u.id === row.unitId)?.name || "—"}
                </td>
                <td>
                  <Badge>{row.active === false ? "Nonaktif" : "Aktif"}</Badge>
                </td>
                <td>
                  <button
                    onClick={() =>
                      setDraft({ ...row, active: row.active !== false })
                    }
                  >
                    Edit master
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {draft && (
        <Modal title="Edit data master" onClose={() => setDraft(undefined)}>
          <Field label="Nama *">
            <input
              value={String(draft.name)}
              onChange={(e) => write("name", e.target.value)}
            />
          </Field>
          {section === "catalogs" ? (
            <>
              <Field label="Kategori">
                <select
                  value={String(draft.category)}
                  onChange={(e) => write("category", e.target.value)}
                >
                  <option value="kind">Jenis naskah</option>
                  <option value="urgency">Derajat</option>
                  <option value="classification">Klasifikasi</option>
                  <option value="instruction">Instruksi disposisi</option>
                </select>
              </Field>
              <Field label="Urutan">
                <input
                  type="number"
                  value={Number(draft.order || 0)}
                  onChange={(e) => write("order", Number(e.target.value))}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Unit *">
                <select
                  value={String(draft.unitId || "")}
                  onChange={(e) => write("unitId", e.target.value)}
                >
                  <option value="">Pilih unit</option>
                  {units.map((u) => (
                    <option value={u.id} key={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
              {section === "users" ? (
                <Field label="Peran simulasi">
                  <select
                    value={String(draft.role)}
                    onChange={(e) => write("role", e.target.value)}
                  >
                    {[
                      "Admin Sistem",
                      "Petugas Urtu/Administrasi",
                      "Kepala RSAU",
                      "Kepala Unit",
                      "Pelaksana",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label="Pengguna aktif penanggung jawab">
                  <select
                    value={String(draft.userId || "")}
                    onChange={(e) => write("userId", e.target.value)}
                  >
                    <option value="">Belum ditetapkan</option>
                    {users
                      .filter((u) => u.active)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
            </>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={!!draft.active}
              onChange={(e) => write("active", e.target.checked)}
            />{" "}
            Aktif
          </label>
          <p>
            Data yang telah digunakan dipertahankan. Nonaktifkan untuk mencegah
            pemilihan baru tanpa memutus riwayat.
          </p>
          <button
            className="primary"
            disabled={!String(draft.name).trim()}
            onClick={() =>
              run(async () => {
                masterSchema.parse(draft);
                if (
                  section !== "catalogs" &&
                  !units.some((u) => u.id === draft.unitId)
                )
                  throw Error("Pilih unit yang valid.");
                if (
                  section === "users" &&
                  draft.role === "Admin Sistem" &&
                  !draft.active &&
                  users.filter(
                    (u) =>
                      u.active &&
                      u.role === "Admin Sistem" &&
                      u.id !== draft.id,
                  ).length === 0
                )
                  throw Error(
                    "Minimal satu admin simulasi aktif harus tersedia.",
                  );
                await db.table(section).put(draft);
                setDraft(undefined);
              }, "Master data disimpan.")
            }
          >
            Simpan master
          </button>
        </Modal>
      )}
    </section>
  );
}
