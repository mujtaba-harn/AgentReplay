// F1.21: the card's settings — title, which stats, file names, theme.
import { CARD_STATS, type CardStatId, MAX_CARD_STATS } from "../card";
import { CARD_THEMES, type CardOptions } from "./RecapCard";

const STAT_LABELS: Readonly<Record<CardStatId, string>> = {
  duration: "Duration",
  files: "Files changed",
  lines: "Lines added and removed",
  toolCalls: "Tool calls",
  tokens: "Tokens",
  steps: "Steps",
  errors: "Errors",
  cost: "Cost",
};

const MAX_TITLE_LENGTH = 80;

interface CardEditorProps {
  options: CardOptions;
  sessionTitle: string;
  onChange: (options: CardOptions) => void;
}

function toggled(list: readonly CardStatId[], id: CardStatId): CardStatId[] {
  return list.includes(id) ? list.filter((s) => s !== id) : [...list, id];
}

export function CardEditor({ options, sessionTitle, onChange }: CardEditorProps) {
  const set = (patch: Partial<CardOptions>) => onChange({ ...options, ...patch });
  const full = options.stats.length >= MAX_CARD_STATS;
  return (
    <form className="card-editor" onSubmit={(e) => e.preventDefault()}>
      <label className="editor-field">
        <span>Title</span>
        <input
          type="text"
          value={options.title}
          placeholder={sessionTitle}
          maxLength={MAX_TITLE_LENGTH}
          onChange={(e) => set({ title: e.target.value })}
        />
      </label>
      <fieldset className="editor-group">
        <legend>
          Stats ({options.stats.length} of {MAX_CARD_STATS})
        </legend>
        {CARD_STATS.map(({ id }) => {
          const checked = options.stats.includes(id);
          return (
            <label key={id} className="editor-check">
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked && full}
                onChange={() => set({ stats: toggled(options.stats, id) })}
              />
              {STAT_LABELS[id]}
            </label>
          );
        })}
      </fieldset>
      <label className="editor-check">
        <input
          type="checkbox"
          checked={options.showFiles}
          onChange={(e) => set({ showFiles: e.target.checked })}
        />
        Show file names
      </label>
      <fieldset className="editor-group card-themes">
        <legend>Theme</legend>
        {CARD_THEMES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className="filter-button"
            aria-pressed={options.theme === value}
            onClick={() => set({ theme: value })}
          >
            {label}
          </button>
        ))}
      </fieldset>
    </form>
  );
}
