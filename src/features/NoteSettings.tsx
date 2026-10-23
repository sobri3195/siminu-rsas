import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type {
  NoteFormat,
  NoteSigner,
  NoteProfile,
  NoteTemplate,
} from "../types";
import { db } from "../storage/db";
import { useApp } from "../app/context";
import { Field, Modal } from "../components/common";
import { id } from "../utils";
import {
  saveNoteProfile,
  saveNoteTemplate,
  defaultNoteFormat,
  blankSigner,
} from "../repositories/nota";
export function SignerFields({
  value,
  onChange,
  disabled = false,
}: {
  value: NoteSigner;
  onChange: (v: NoteSigner) => void;
  disabled?: boolean;
}) {
  return (
    <div className="form-grid">
      {(
        [
          ["title", "Jabatan penandatangan"],
          ["name", "Nama penandatangan"],
          ["rank", "Pangkat"],
          ["serviceNumber", "NRP/NIP"],
          ["city", "Kota"],
          ["date", "Tanggal penandatanganan"],
        ] as const
      ).map(([k, label]) => (
        <Field key={k} label={label}>
          <input
            disabled={disabled}
            type={k === "date" ? "date" : "text"}
            value={value[k]}
            onChange={(e) => onChange({ ...value, [k]: e.target.value })}
          />
        </Field>
      ))}
    </div>
  );
}
export function FormatFields({
  value,
  onChange,
  disabled = false,
}: {
  value: NoteFormat;
  onChange: (v: NoteFormat) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <Field label="Kop nota dinas">
        <textarea
          disabled={disabled}
          rows={2}
          value={value.heading}
          onChange={(e) => onChange({ ...value, heading: e.target.value })}
        />
      </Field>
      <div className="form-grid">
        <Field label="Font dokumen">
          <select
            disabled={disabled}
            value={value.font}
            onChange={(e) =>
              onChange({ ...value, font: e.target.value as NoteFormat["font"] })
            }
          >
            <option>Times New Roman</option>
            <option>Arial</option>
          </select>
        </Field>
        {(["fontSize", "top", "bottom", "left", "right"] as const).map(
          (k, i) => (
            <Field
              key={k}
              label={
                [
                  "Ukuran font (pt)",
                  "Margin atas (mm)",
                  "Margin bawah (mm)",
                  "Margin kiri (mm)",
                  "Margin kanan (mm)",
                ][i]
              }
            >
              <input
                disabled={disabled}
                type="number"
                min={k === "fontSize" ? 9 : 10}
                max={k === "fontSize" ? 16 : 40}
                value={value[k]}
                onChange={(e) =>
                  onChange({ ...value, [k]: Number(e.target.value) })
                }
              />
            </Field>
          ),
        )}
        {(["lineSpacing", "paragraphAfter", "signatureSpace"] as const).map(
          (k, i) => (
            <Field
              key={k}
              label={
                [
                  "Jarak baris (kali)",
                  "Jarak antarparagraf (pt)",
                  "Ruang tanda tangan (mm)",
                ][i]
              }
            >
              <input
                disabled={disabled}
                type="number"
                step={k === "lineSpacing" ? 0.05 : 1}
                min={k === "lineSpacing" ? 1 : k === "signatureSpace" ? 15 : 0}
                max={k === "lineSpacing" ? 2 : k === "signatureSpace" ? 50 : 18}
                value={value[k]}
                onChange={(e) =>
                  onChange({ ...value, [k]: Number(e.target.value) })
                }
              />
            </Field>
          ),
        )}
        <Field label="Register nota">
          <input
            disabled={disabled}
            value={value.register}
            onChange={(e) => onChange({ ...value, register: e.target.value })}
          />
        </Field>
        <Field label="Kode unit penomoran">
          <input
            disabled={disabled}
            value={value.unitCode}
            onChange={(e) => onChange({ ...value, unitCode: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Pola nomor nota">
        <input
          disabled={disabled}
          value={value.numberPattern}
          onChange={(e) =>
            onChange({ ...value, numberPattern: e.target.value })
          }
        />
      </Field>
      <p className="muted">
        Token wajib: {"{register}, {seq}, {month}, {year}, {unit}"}. Bulan
        memakai angka Romawi. Keunikan nomor dijaga dalam database ini; impor
        perangkat lain tetap diperiksa.
      </p>
      <Field label="Sumber contoh format">
        <input
          disabled={disabled}
          placeholder="Nama dokumen acuan yang diperiksa pengguna"
          value={value.source}
          onChange={(e) => onChange({ ...value, source: e.target.value })}
        />
      </Field>
      <label>
        <input
          disabled={disabled}
          type="checkbox"
          checked={value.verified}
          onChange={(e) => onChange({ ...value, verified: e.target.checked })}
        />{" "}
        Saya sudah memeriksa kesesuaian format dengan sumber di atas
      </label>
    </>
  );
}
export function NoteSettings({ onClose }: { onClose: () => void }) {
  const { user, run } = useApp(),
    profiles = useLiveQuery(() => db.noteProfiles.toArray()) || [],
    templates = useLiveQuery(() => db.noteTemplates.toArray()) || [],
    units = useLiveQuery(() => db.units.toArray()) || [];
  const [profile, setProfile] = useState<NoteProfile>(),
    [template, setTemplate] = useState<NoteTemplate>();
  return (
    <Modal title="Template & pengaturan nota dinas" onClose={onClose}>
      <p>
        Pengaturan menjadi nilai awal untuk konsep baru. Isi dan format nota
        yang telah dibuat tetap mengikuti snapshot dokumennya.
      </p>
      <h2>Profil per unit</h2>
      <div className="toolbar">
        {profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setProfile(structuredClone(p));
              setTemplate(undefined);
            }}
          >
            {p.name}
          </button>
        ))}
        <button
          onClick={() => {
            setTemplate(undefined);
            setProfile({
              id: id(),
              name: "Profil unit baru",
              unitId: "",
              from: "",
              signer: blankSigner(),
              format: {
                ...defaultNoteFormat,
                heading: "RSAU Prof. dr. ABDULRACHMAN SALEH",
                unitCode: "UNIT",
              },
            });
          }}
        >
          Tambah profil unit
        </button>
      </div>
      {profile && (
        <>
          <Field label="Nama profil">
            <input
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            />
          </Field>
          <Field label="Unit profil">
            <select
              value={profile.unitId}
              onChange={(e) =>
                setProfile({ ...profile, unitId: e.target.value })
              }
            >
              <option value="">Belum ditautkan</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Dari (nilai awal)">
            <input
              value={profile.from}
              onChange={(e) => setProfile({ ...profile, from: e.target.value })}
            />
          </Field>
          <SignerFields
            value={profile.signer}
            onChange={(signer) => setProfile({ ...profile, signer })}
          />
          <FormatFields
            value={profile.format}
            onChange={(format) => setProfile({ ...profile, format })}
          />
          <button
            className="primary"
            onClick={() =>
              run(
                () => saveNoteProfile(profile, user.id),
                "Profil unit disimpan.",
              )
            }
          >
            Simpan profil nota
          </button>
        </>
      )}
      <h2>Template isi</h2>
      <div className="toolbar">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTemplate(structuredClone(t));
              setProfile(undefined);
            }}
          >
            {t.name}
          </button>
        ))}
        <button
          onClick={() => {
            setProfile(undefined);
            setTemplate({
              id: id(),
              name: "Template khusus",
              category: "Permohonan",
              instructions: "Isi seluruh bagian sesuai dokumen sumber.",
              body: {
                subject: "",
                basis: [""],
                opening: "",
                discussion: "",
                request: "",
                closing: "",
              },
            });
          }}
        >
          Tambah template khusus
        </button>
      </div>
      {template && (
        <>
          <Field label="Nama template khusus">
            <input
              value={template.name}
              onChange={(e) =>
                setTemplate({ ...template, name: e.target.value })
              }
            />
          </Field>
          <Field label="Petunjuk pengisian">
            <textarea
              value={template.instructions}
              onChange={(e) =>
                setTemplate({ ...template, instructions: e.target.value })
              }
            />
          </Field>
          <Field label="Kategori template">
            <select
              value={template.category}
              onChange={(e) =>
                setTemplate({
                  ...template,
                  category: e.target.value as NoteTemplate["category"],
                })
              }
            >
              {["Permohonan", "Laporan", "Pemberitahuan", "Usulan"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          {(
            [
              "subject",
              "basis",
              "opening",
              "discussion",
              "request",
              "closing",
            ] as const
          ).map((k) => (
            <Field key={k} label={"Template " + k}>
              <textarea
                value={
                  k === "basis"
                    ? template.body.basis.join("\n")
                    : template.body[k]
                }
                onChange={(e) =>
                  setTemplate({
                    ...template,
                    body: {
                      ...template.body,
                      [k]:
                        k === "basis"
                          ? e.target.value.split("\n")
                          : e.target.value,
                    },
                  })
                }
              />
            </Field>
          ))}
          <button
            className="primary"
            onClick={() =>
              run(
                () => saveNoteTemplate(template, user.id),
                "Template isi disimpan.",
              )
            }
          >
            Simpan template nota
          </button>
        </>
      )}
    </Modal>
  );
}
