import { useState } from "react";
import { Link } from "react-router-dom";
import { today } from "../utils";
import type { AgendaEvent, Task } from "../types";
export function Calendar({
  events,
  tasks,
}: {
  events: AgendaEvent[];
  tasks: Task[];
}) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [year, m] = month.split("-").map(Number);
  const count = new Date(year, m, 0).getDate();
  const offset = (new Date(year, m - 1, 1).getDay() + 6) % 7;
  return (
    <section className="panel month-calendar">
      <label className="field">
        <span>Bulan agenda</span>
        <input
          type="month"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
        />
      </label>
      <div className="calendar-scroll">
        <div className="month-grid">
          {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => (
            <strong className="day-label" key={d}>
              {d}
            </strong>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <div key={`empty-${i}`} className="day muted-day" />
          ))}
          {Array.from({ length: count }, (_, i) => {
            const date = `${month}-${String(i + 1).padStart(2, "0")}`;
            return (
              <div
                className={`day ${date === today() ? "today" : ""}`}
                key={date}
              >
                <strong>{i + 1}</strong>
                {events
                  .filter((e) => e.date === date)
                  .map((e) => (
                    <div className="calendar-event" key={e.id}>
                      <small>Kegiatan</small>
                      {e.letterId ? (
                        <Link to={`/surat-masuk/${e.letterId}`}>{e.title}</Link>
                      ) : (
                        e.title
                      )}
                    </div>
                  ))}
                {tasks
                  .filter((t) => t.deadline === date && t.status !== "Selesai")
                  .map((t) => (
                    <Link
                      className="calendar-task"
                      key={t.id}
                      to={`/surat-masuk/${t.letterId}`}
                    >
                      <small>Tenggat tugas</small>
                      {t.unitName}
                    </Link>
                  ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
