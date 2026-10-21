// Home: the coffees you still have. Finished bags live in the Library.
import { Plant } from "@phosphor-icons/react";
import { useApp } from "../ctx.ts";
import { isFinished } from "../group.ts";
import { Button } from "../ui.tsx";
import Shelf from "../components/Shelf.tsx";

export default function Home() {
  const { db, go } = useApp();
  return (
    <div className="page stack-lg">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Home</h1>
        <Button icon={Plant} onClick={() => go("beans", "new")}>Add bean</Button>
      </div>
      <Shelf
        beans={db.beans.filter((b) => !isFinished(b.finished))} storageKey="home"
        empty={db.beans.length ? "Every bag is finished. Add a new bean, or find past coffees in the Library." : "No coffees yet. Add the beans you are brewing, then log your first cup."}
      />
    </div>
  );
}
