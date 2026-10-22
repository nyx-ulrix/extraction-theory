// Home: the coffees you still have. Finished bags live in the Library.
import { DownloadSimple, Plant, Scan } from "@phosphor-icons/react";
import { useInstall } from "../install.ts";
import { useApp } from "../ctx.ts";
import { isFinished } from "../group.ts";
import { Button, IconButton } from "../ui.tsx";
import Shelf from "../components/Shelf.tsx";

export default function Home() {
  const { db, go } = useApp();
  const app = useInstall();
  return (
    <div className="page stack-lg">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Home</h1>
        <div className="row">
          {app.canPrompt && !app.installed && <Button ghost icon={DownloadSimple} onClick={app.install}>Install app</Button>}
          <IconButton icon={Scan} label="Scan a coffee code" onClick={() => go("scan")} />
          <Button icon={Plant} onClick={() => go("beans", "new")}>Add bean</Button>
        </div>
      </div>
      <Shelf
        beans={db.beans.filter((b) => !isFinished(b.finished))} storageKey="home"
        empty={db.beans.length ? "Every bag is finished. Add a new bean, or find past coffees in the Library." : "No coffees yet. Add the beans you are brewing, then log your first cup."}
      />
    </div>
  );
}
