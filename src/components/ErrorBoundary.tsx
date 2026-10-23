import { Component, type ReactNode } from "react";
import { createFullBackup } from "../repositories/fullBackup";
import { download } from "../utils";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="boot">
        <h1>Aplikasi mengalami masalah</h1>
        <p role="alert">{this.state.error}</p>
        <p>
          Data browser belum dihapus. Buat cadangan sebelum mencoba pemulihan.
        </p>
        <button
          onClick={async () => {
            try {
              download(await createFullBackup(), "cadangan-pemulihan.zip");
            } catch (e) {
              this.setState({
                error: "Cadangan belum dapat dibuat: " + String(e),
              });
            }
          }}
        >
          Ekspor cadangan pemulihan
        </button>
        <button onClick={() => location.reload()}>Muat ulang aplikasi</button>
        <a href="/pusat-data">Buka Pusat Data Lokal</a>
      </main>
    );
  }
}
