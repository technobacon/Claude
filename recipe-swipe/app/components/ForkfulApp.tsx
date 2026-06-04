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

/** Tiny, guarded haptic tap (Android/desktop support it; harmless on iOS). */
function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}

interface SwipeRecord {
  recipe: Recipe;
  direction: SwipeDirection;
}

export default function ForkfulApp() {
  const [tab, setTab] = useState<Tab>("discover");
  const [active, setActive] = useState<Set<string>>(new Set());
  const [deck, setDeck] = useState<Recipe[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<Recipe[]>([]);
  const [detail, setDetail] = useState<Recipe | null>(null);
  const [history, setHistory] = useState<SwipeRecord[]>([]);

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
    setHistory([]);
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
      haptic(direction === "right" ? 14 : 8);
      setDeck((d) => d.filter((r) => r.id !== recipe.id));
      setHistory((h) => [...h, { recipe, direction }]);
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

  const onUndo = useCallback(async () => {
    setHistory((h) => {
      const last = h[h.length - 1];
      if (!last) return h;
      haptic(10);
      setDeck((d) => [last.recipe, ...d.filter((r) => r.id !== last.recipe.id)]);
      void fetch(`/api/swipe?recipeId=${encodeURIComponent(last.recipe.id)}`, {
        method: "DELETE",
      });
      return h.slice(0, -1);
    });
  }, []);

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
            <SkeletonCard />
          ) : deck.length === 0 ? (
            <div className="empty">
              <p>🍽️ No more cards. Try different filters.</p>
              <button className="tab active" onClick={() => void loadFeed()}>
                Reload deck
              </button>
            </div>
          ) : (
            <SwipeDeck deck={deck} onSwipe={onSwipe} onOpen={setDetail} />
          )}

          {!loading && deck.length > 0 && (
            <div className="controls">
              <button
                className="btn-nope"
                onClick={() => onSwipe(deck[0], "left")}
                aria-label="Skip"
              >
                ✕
              </button>
              <button
                className="btn-undo"
                onClick={() => void onUndo()}
                disabled={history.length === 0}
                aria-label="Undo last swipe"
              >
                ↩
              </button>
              <button
                className="btn-like"
                onClick={() => onSwipe(deck[0], "right")}
                aria-label="Save"
              >
                ♥
              </button>
            </div>
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
          onOpen={setDetail}
          onRemove={async (id) => {
            setSaved((s) => s.filter((r) => r.id !== id));
            await fetch(`/api/list?recipeId=${encodeURIComponent(id)}`, {
              method: "DELETE",
            });
          }}
        />
      )}

      {detail && (
        <DetailSheet
          recipe={detail}
          onClose={() => setDetail(null)}
          onSwipe={
            tab === "discover"
              ? (dir) => {
                  onSwipe(detail, dir);
                  setDetail(null);
                }
              : undefined
          }
        />
      )}
    </main>
  );
}

function SwipeDeck({
  deck,
  onSwipe,
  onOpen,
}: {
  deck: Recipe[];
  onSwipe: (r: Recipe, d: SwipeDirection) => void;
  onOpen: (r: Recipe) => void;
}) {
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
            onOpen={onOpen}
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
  onOpen,
}: {
  recipe: Recipe;
  isTop: boolean;
  depth: number;
  onSwipe: (r: Recipe, d: SwipeDirection) => void;
  onOpen: (r: Recipe) => void;
}) {
  const [dx, setDx] = useState(0);
  const [flyOff, setFlyOff] = useState<0 | 1 | -1>(0);
  const drag = useRef({ startX: 0, startY: 0, startT: 0, active: false, moved: false });

  const commit = (direction: SwipeDirection) => {
    setFlyOff(direction === "right" ? 1 : -1);
    setTimeout(() => onSwipe(recipe, direction), 200);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!isTop) return;
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      startT: Date.now(),
      active: true,
      moved: false,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const d = e.clientX - drag.current.startX;
    if (Math.abs(d) > 6) drag.current.moved = true;
    setDx(d);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    const dt = Date.now() - drag.current.startT;
    const dist = Math.abs(dx);
    const flick = dt < 250 && dist > 50; // quick flick counts even if short
    if (dx > 0 && (dist > SWIPE_THRESHOLD || flick)) commit("right");
    else if (dx < 0 && (dist > SWIPE_THRESHOLD || flick)) commit("left");
    else {
      // Treat a near-stationary release as a tap → open recipe detail.
      const dy = Math.abs(e.clientY - drag.current.startY);
      if (!drag.current.moved && dist < 6 && dy < 6) onOpen(recipe);
      setDx(0);
    }
  };

  const offset = flyOff !== 0 ? flyOff * 1000 : dx;
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
        transform: `translateX(${offset}px) translateY(${depth * 10}px) rotate(${rot}deg) scale(${1 - depth * 0.04})`,
        transition: drag.current.active
          ? "none"
          : "transform 0.28s cubic-bezier(0.18, 0.89, 0.32, 1.1)",
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
        <img className="photo" src={recipe.image.url} alt={recipe.title} draggable={false} />
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
        <div className="source">
          via {recipe.publisher ?? recipe.source} · tap for details
        </div>
      </div>
    </article>
  );
}

function DetailSheet({
  recipe,
  onClose,
  onSwipe,
}: {
  recipe: Recipe;
  onClose: () => void;
  onSwipe?: (d: SwipeDirection) => void;
}) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {recipe.image?.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="sheet-photo" src={recipe.image.url} alt={recipe.title} />
        )}
        <div className="sheet-body">
          <h2>{recipe.title}</h2>
          <div className="meta">
            {[
              ...recipe.tags.cuisine,
              ...recipe.tags.mealType,
              ...recipe.tags.diet,
              ...recipe.tags.mainIngredients,
            ]
              .slice(0, 6)
              .map((t) => (
                <span className="pill" key={t}>
                  {t}
                </span>
              ))}
          </div>

          <h3>Ingredients</h3>
          <ul className="ing-list">
            {recipe.ingredients.map((i, idx) => (
              <li key={idx}>{i.raw}</li>
            ))}
          </ul>

          {recipe.instructionsSummary && (
            <p className="summary">{recipe.instructionsSummary}</p>
          )}

          {/* We never mirror the full method — cook on the publisher's site. */}
          <a
            className="cook-cta"
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Cook on {recipe.publisher ?? recipe.source} →
          </a>

          {onSwipe && (
            <div className="sheet-actions">
              <button className="btn-nope" onClick={() => onSwipe("left")}>
                ✕ Skip
              </button>
              <button className="btn-like" onClick={() => onSwipe("right")}>
                ♥ Save
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="deck">
      <div className="card skeleton">
        <div className="photo sk-shimmer" />
        <div className="body">
          <div className="sk-line sk-shimmer" style={{ width: "70%", height: 22 }} />
          <div className="sk-line sk-shimmer" style={{ width: "40%" }} />
          <div className="sk-line sk-shimmer" style={{ width: "90%" }} />
          <div className="sk-line sk-shimmer" style={{ width: "80%" }} />
        </div>
      </div>
    </div>
  );
}

function SavedList({
  saved,
  onOpen,
  onRemove,
}: {
  saved: Recipe[];
  onOpen: (r: Recipe) => void;
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
            <img src={r.image.url} alt={r.title} onClick={() => onOpen(r)} />
          )}
          <div className="info" onClick={() => onOpen(r)}>
            <span className="title-link">{r.title}</span>
            <br />
            <small className="cook">Tap for details · cook on {r.publisher ?? r.source}</small>
          </div>
          <button className="remove" onClick={() => onRemove(r.id)} aria-label="Remove">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
