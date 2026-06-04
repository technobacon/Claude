"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Recipe, SwipeDirection } from "@/core/model.ts";

type Tab = "discover" | "saved";

interface FilterDef {
  label: string;
  param: "diet" | "mealType" | "include";
  value: string;
}

// Kept to filters TheMealDB can actually serve, so the demo returns results.
const FILTERS: FilterDef[] = [
  { label: "Vegetarian", param: "diet", value: "vegetarian" },
  { label: "Vegan", param: "diet", value: "vegan" },
  { label: "Breakfast", param: "mealType", value: "breakfast" },
  { label: "Dessert", param: "mealType", value: "dessert" },
  { label: "Chicken", param: "include", value: "chicken" },
  { label: "Beef", param: "include", value: "beef" },
  { label: "Seafood", param: "include", value: "fish" },
];

const SWIPE_THRESHOLD = 110;

export default function ForkfulApp() {
  const [tab, setTab] = useState<Tab>("discover");
  const [active, setActive] = useState<Set<string>>(new Set());
  const [deck, setDeck] = useState<Recipe[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<Recipe[]>([]);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    const byParam: Record<string, string[]> = {};
    for (const f of FILTERS) {
      if (active.has(f.label)) (byParam[f.param] ??= []).push(f.value);
    }
    for (const [k, v] of Object.entries(byParam)) params.set(k, v.join(","));
    params.set("limit", "20");
    return params.toString();
  }, [active]);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/feed?${buildQuery()}`);
      const data = await res.json();
      setDeck(data.deck ?? []);
      setSources(data.sources ?? []);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  const loadSaved = useCallback(async () => {
    const res = await fetch("/api/list");
    const data = await res.json();
    setSaved(data.saved ?? []);
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    if (tab === "saved") void loadSaved();
  }, [tab, loadSaved]);

  const onSwipe = useCallback(
    async (recipe: Recipe, direction: SwipeDirection) => {
      setDeck((d) => d.filter((r) => r.id !== recipe.id));
      try {
        await fetch("/api/swipe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ recipeId: recipe.id, direction }),
        });
      } catch {
        /* swipe is best-effort; deck already advanced */
      }
    },
    [],
  );

  const toggle = (label: string) => {
    setActive((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          Fork<span>ful</span>
        </div>
        <nav className="tabs">
          <button
            className={`tab ${tab === "discover" ? "active" : ""}`}
            onClick={() => setTab("discover")}
          >
            Discover
          </button>
          <button
            className={`tab ${tab === "saved" ? "active" : ""}`}
            onClick={() => setTab("saved")}
          >
            Saved {saved.length ? `(${saved.length})` : ""}
          </button>
        </nav>
      </header>

      {tab === "discover" ? (
        <>
          <div className="filters">
            {FILTERS.map((f) => (
              <button
                key={f.label}
                className={`chip ${active.has(f.label) ? "on" : ""}`}
                onClick={() => toggle(f.label)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="loading">Finding recipes…</p>
          ) : deck.length === 0 ? (
            <div className="empty">
              <p>No more cards. Try different filters.</p>
              <button className="tab active" onClick={() => void loadFeed()}>
                Reload
              </button>
            </div>
          ) : (
            <SwipeDeck deck={deck} onSwipe={onSwipe} />
          )}

          {sources.length > 0 && (
            <p className="source" style={{ textAlign: "center", marginTop: 10 }}>
              Sources: {sources.join(" · ")}
            </p>
          )}
        </>
      ) : (
        <SavedList
          saved={saved}
          onRemove={async (id) => {
            setSaved((s) => s.filter((r) => r.id !== id));
            await fetch(`/api/list?recipeId=${encodeURIComponent(id)}`, {
              method: "DELETE",
            });
          }}
        />
      )}
    </main>
  );
}

function SwipeDeck({
  deck,
  onSwipe,
}: {
  deck: Recipe[];
  onSwipe: (r: Recipe, d: SwipeDirection) => void;
}) {
  // Render up to 3 cards stacked; only the top one is interactive.
  const visible = deck.slice(0, 3);
  return (
    <div className="deck">
      {visible
        .map((recipe, i) => (
          <Card
            key={recipe.id}
            recipe={recipe}
            isTop={i === 0}
            depth={i}
            onSwipe={onSwipe}
          />
        ))
        .reverse()}
    </div>
  );
}

function Card({
  recipe,
  isTop,
  depth,
  onSwipe,
}: {
  recipe: Recipe;
  isTop: boolean;
  depth: number;
  onSwipe: (r: Recipe, d: SwipeDirection) => void;
}) {
  const [dx, setDx] = useState(0);
  const [flyOff, setFlyOff] = useState<0 | 1 | -1>(0);
  const drag = useRef<{ startX: number; active: boolean }>({
    startX: 0,
    active: false,
  });

  const commit = (direction: SwipeDirection) => {
    setFlyOff(direction === "right" ? 1 : -1);
    setTimeout(() => onSwipe(recipe, direction), 180);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!isTop) return;
    drag.current = { startX: e.clientX, active: true };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    setDx(e.clientX - drag.current.startX);
  };
  const onPointerUp = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (dx > SWIPE_THRESHOLD) commit("right");
    else if (dx < -SWIPE_THRESHOLD) commit("left");
    else setDx(0);
  };

  const offset = flyOff !== 0 ? flyOff * 600 : dx;
  const rot = offset / 18;
  const likeOpacity = Math.max(0, Math.min(1, offset / SWIPE_THRESHOLD));
  const nopeOpacity = Math.max(0, Math.min(1, -offset / SWIPE_THRESHOLD));

  const ingredientLine = recipe.ingredients
    .map((i) => i.name ?? i.raw)
    .slice(0, 8)
    .join(", ");

  return (
    <article
      className="card"
      style={{
        transform: `translateX(${offset}px) translateY(${depth * 8}px) rotate(${rot}deg) scale(${1 - depth * 0.04})`,
        transition: drag.current.active ? "none" : "transform 0.18s ease-out",
        zIndex: 10 - depth,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="stamp like" style={{ opacity: likeOpacity }}>
        SAVE
      </div>
      <div className="stamp nope" style={{ opacity: nopeOpacity }}>
        SKIP
      </div>

      {recipe.image?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="photo" src={recipe.image.url} alt={recipe.title} />
      ) : (
        <div className="photo" />
      )}

      <div className="body">
        <h2>{recipe.title}</h2>
        <div className="meta">
          {recipe.tags.cuisine[0] && (
            <span className="pill">{recipe.tags.cuisine[0]}</span>
          )}
          {recipe.tags.mealType[0] && (
            <span className="pill">{recipe.tags.mealType[0]}</span>
          )}
          {recipe.tags.diet[0] && (
            <span className="pill">{recipe.tags.diet[0]}</span>
          )}
          {recipe.rating && (
            <span className="pill">
              ★ {recipe.rating.value}/{recipe.rating.scale}
            </span>
          )}
        </div>
        <p className="ingredients">{ingredientLine}</p>
        <div className="source">via {recipe.publisher ?? recipe.source}</div>
      </div>

      {isTop && (
        <div className="controls" style={{ position: "absolute", bottom: 12, left: 0, right: 0 }}>
          <button className="btn-nope" onClick={() => commit("left")} aria-label="Skip">
            ✕
          </button>
          <button className="btn-like" onClick={() => commit("right")} aria-label="Save">
            ♥
          </button>
        </div>
      )}
    </article>
  );
}

function SavedList({
  saved,
  onRemove,
}: {
  saved: Recipe[];
  onRemove: (id: string) => void;
}) {
  if (saved.length === 0) {
    return <p className="empty">No saved recipes yet. Swipe right to save.</p>;
  }
  return (
    <div>
      {saved.map((r) => (
        <div className="list-item" key={r.id}>
          {r.image?.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.image.url} alt={r.title} />
          )}
          <div className="info">
            {/* Deep-link OUT to the original publisher — we never mirror content. */}
            <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer">
              {r.title}
            </a>
            <br />
            <small>
              <span className="cook">Cook on {r.publisher ?? r.source} →</span>
            </small>
          </div>
          <button
            className="remove"
            onClick={() => onRemove(r.id)}
            aria-label="Remove"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
