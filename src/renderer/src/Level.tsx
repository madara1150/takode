import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react'
import { activeXp, compact, levelColor, levelFor, MAX_LEVEL, tierOf, totalTokens, xpForLevel, type Tier } from '../../shared/level'
import {
  isUnlocked,
  LEVEL_UP_EFFECTS,
  nextRewards,
  REWARDS,
  rewardsAt,
  RING_STYLES,
  unlockLevel,
  type Reward,
  type RewardKind
} from '../../shared/rewards'
import { call } from './api'
import { useApp } from './App'
import { SettingRow, Toggle } from './Controls'
import { useT, type Key } from './i18n'
import { Icon } from './icons'
import { RedeemBox } from './Redeem'
import { Star } from './RepoStar'
import { iconsUnlockedAt } from '../../shared/repoIcon'

const TIER_KEY: Record<Tier, Key> = {
  hatchling: 'tierHatchling',
  swimmer: 'tierSwimmer',
  explorer: 'tierExplorer',
  navigator: 'tierNavigator',
  diver: 'tierDiver',
  captain: 'tierCaptain',
  admiral: 'tierAdmiral',
  kraken: 'tierKraken',
  leviathan: 'tierLeviathan',
  abyss: 'tierAbyss',
  legend: 'tierLegend'
}
const RING_KEY: Record<string, Key> = {
  basic: 'ringBasic',
  glow: 'ringGlow',
  double: 'ringDouble',
  sparkle: 'ringSparkle',
  orbit: 'ringOrbit',
  comet: 'ringComet',
  pulse: 'ringPulse',
  flame: 'ringFlame',
  rgb: 'ringRgb'
}
const EFFECT_KEY: Record<string, Key> = {
  confetti: 'effectConfetti',
  bubbles: 'effectBubbles',
  stars: 'effectStars',
  fireworks: 'effectFireworks'
}
const KIND_ICON: Record<RewardKind, string> = { title: 'star', theme: 'palette', accent: 'palette', ring: 'sparkle', effect: 'gift' }

/** CSS variables carrying a level's own colours. */
export function levelStyle(level: number): CSSProperties {
  const c = levelColor(level)
  return { ['--tier' as string]: c.main, ['--tier2' as string]: c.second }
}
const levelClass = (level: number): string => (level >= MAX_LEVEL ? 'lv-max' : '')

/** The ring style to draw: the chosen one if unlocked; level 100 shows RGB unless something else was picked. */
function ringFor(style: string, level: number): string {
  if (!isUnlocked('ring', style, level)) return level >= MAX_LEVEL ? 'rgb' : 'basic'
  return style === 'basic' && level >= MAX_LEVEL ? 'rgb' : style
}

export function useLevel(): number {
  return levelFor(activeXp(useApp().state)).level
}

/** Round badge with the level number inside a progress ring, drawn in the chosen style. */
export function LevelRing({ xp, size = 40, style }: { xp: number; size?: number; style?: string }): ReactElement {
  const { state } = useApp()
  const info = levelFor(xp)
  const ring = style ?? ringFor(state.settings.ringStyle, info.level)
  const r = size / 2 - 3
  const c = 2 * Math.PI * r
  return (
    <span className={`level-ring ring-${ring} ${levelClass(info.level)}`} style={{ width: size, height: size, ...levelStyle(info.level) }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="ring-fill"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - info.progress)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <i className="ring-fx" aria-hidden="true" />
      <b style={{ fontSize: size * (info.level >= 100 ? 0.3 : 0.36) }}>{info.level}</b>
    </span>
  )
}

function rewardName(r: Reward, lang: string): string {
  return lang === 'th' ? r.name.th : r.name.en
}

/** Small level card in the sidebar, with the next reward to aim for. */
export function LevelCard(): ReactElement | null {
  const { state, setModal } = useApp()
  const t = useT()
  if (!state.settings.showLevel) return null
  if (state.auth.mode !== 'account') {
    return (
      <button className="level-card level-locked" onClick={() => void call('auth:logout')} title={t('levelNeedsAccount')} data-testid="level-locked">
        <span className="level-lock-ring">
          <Icon name="lock" size={15} />
        </span>
        <span className="level-text">
          <strong>{t('levelOff')}</strong>
          <span className="muted small">{t('levelSignIn')}</span>
        </span>
      </button>
    )
  }
  const info = levelFor(state.stats.xp)
  const tier = tierOf(info.level)
  const next = nextRewards(info.level)
  const aura = state.settings.aura && isUnlocked('effect', 'aura', info.level)
  return (
    <button
      className={`level-card ${levelClass(info.level)} ${aura ? 'aura' : ''}`}
      style={levelStyle(info.level)}
      onClick={() => setModal({ type: 'settings', tab: 'level' })}
      title={`${t('levelN', { n: info.level })} · ${compact(state.stats.xp)} XP`}
    >
      {info.level >= MAX_LEVEL && <Sparkles />}
      <LevelRing xp={state.stats.xp} size={34} />
      <span className="level-text">
        <strong>{t(TIER_KEY[tier])}</strong>
        <span className="level-mini-bar">
          <i style={{ width: `${Math.round(info.progress * 100)}%` }} />
        </span>
        {next ? (
          <span className="level-next" style={levelStyle(next.level)}>
            <Icon name="gift" size={11} />
            <span>
              Lv {next.level} · {rewardName(next.rewards[0], state.settings.language)}
            </span>
          </span>
        ) : (
          <span className="muted small">{t('allRewards')}</span>
        )}
      </span>
    </button>
  )
}

/** Twinkling dots for level 100. */
function Sparkles({ count = 7 }: { count?: number }): ReactElement {
  const dots = useMemo(
    () => Array.from({ length: count }, (_, i) => ({ left: (i * 41 + 7) % 100, top: (i * 67 + 13) % 100, delay: (i * 0.37) % 2.2 })),
    [count]
  )
  return (
    <span className="sparkles" aria-hidden="true">
      {dots.map((d, i) => (
        <i key={i} style={{ left: `${d.left}%`, top: `${d.top}%`, animationDelay: `${d.delay}s` }} />
      ))}
    </span>
  )
}

/** Settings → Level: progress, the reward road, your cosmetics and the 100 level colours. */
export function LevelPane(): ReactElement {
  const { state, run } = useApp()
  const t = useT()
  const s = state.settings
  const lang = s.language
  const stats = state.stats
  const guest = state.auth.mode !== 'account'
  const xp = activeXp(state)
  const info = levelFor(xp)
  const tier = tierOf(info.level)
  const next = nextRewards(info.level)
  const [preview, setPreview] = useState<string | null>(null)
  const update = (patch: Partial<typeof s>): void => void call('settings:update', patch)
  const since = new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(stats.since)
  const reset = (): void => {
    if (window.confirm(t('levelResetConfirm'))) void run(() => call('stats:reset'))
  }
  // Rewards grouped by the level that brings them.
  const road = useMemo(() => {
    const levels = [...new Set(REWARDS.map((r) => r.level))]
    return levels.map((level) => ({ level, rewards: rewardsAt(level) }))
  }, [])

  return (
    <>
      {guest && (
        <div className="level-guest" role="note" data-testid="level-guest">
          <Icon name="lock" size={18} />
          <div>
            <strong>{t('levelOff')}</strong>
            <span className="muted small">{t('levelNeedsAccount')}</span>
          </div>
          <button className="btn primary" onClick={() => void call('auth:logout')}>
            {t('signIn')}
          </button>
        </div>
      )}
      <div className={`level-hero ${levelClass(info.level)}`} style={levelStyle(info.level)}>
        {info.level >= MAX_LEVEL && <Sparkles count={14} />}
        <LevelRing xp={xp} size={88} />
        <div className="level-hero-text">
          <span className="muted small">{t('levelN', { n: info.level })}</span>
          <strong>{t(TIER_KEY[tier])}</strong>
          <div className="level-bar">
            <i style={{ width: `${Math.round(info.progress * 100)}%` }} />
          </div>
          <span className="muted small">
            {info.maxed
              ? t('levelMax')
              : t('levelProgress', { into: compact(info.into), span: compact(info.span), next: info.level + 1 })}
          </span>
          {next && (
            <span className="hero-next" style={levelStyle(next.level)}>
              <Icon name="gift" size={13} />
              {next.level - info.level === 1 ? t('nextRewardNow') : t('nextRewardIn', { n: next.level - info.level })}:{' '}
              <b>{next.rewards.map((r) => rewardName(r, lang)).join(', ')}</b>
            </span>
          )}
        </div>
      </div>

      <RedeemBox />

      <div className="stat-grid">
        <div>
          <span className="muted small">{t('statXp')}</span>
          <strong>{compact(xp)}</strong>
        </div>
        <div>
          <span className="muted small">{t('statTokens')}</span>
          <strong>{compact(totalTokens(stats))}</strong>
        </div>
        <div>
          <span className="muted small">{t('statReplies')}</span>
          <strong>{stats.replies.toLocaleString()}</strong>
        </div>
        <div>
          <span className="muted small">{t('statInOut')}</span>
          <strong>
            {compact(stats.input + stats.cacheWrite)} / {compact(stats.output)}
          </strong>
        </div>
      </div>
      <p className="muted small">{t('levelHow', { since })}</p>

      <h4>{t('cosmetics')}</h4>
      <p className="muted small">{t('cosmeticsHint')}</p>
      <div className="ring-picker" role="radiogroup" aria-label={t('ringStyle')}>
        {RING_STYLES.map((style) => {
          const need = unlockLevel('ring', style)
          const locked = info.level < need
          const active = ringFor(s.ringStyle, info.level) === style
          return (
            <button
              key={style}
              role="radio"
              aria-checked={active}
              disabled={locked}
              className={`ring-option ${active ? 'active' : ''} ${locked ? 'locked' : ''}`}
              title={locked ? t('unlockAt', { n: need }) : t(RING_KEY[style])}
              onClick={() => update({ ringStyle: style })}
            >
              <LevelRing xp={xp} size={40} style={style} />
              <span>{t(RING_KEY[style])}</span>
              {locked && (
                <span className="lock-badge">
                  <Icon name="lock" size={10} />
                  {need}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <SettingRow label={t('levelUpEffect')}>
        <div className="seg">
          {LEVEL_UP_EFFECTS.map((fx) => {
            const need = unlockLevel('effect', fx)
            const locked = info.level < need
            return (
              <button
                key={fx}
                type="button"
                disabled={locked}
                className={s.levelUpEffect === fx ? 'active' : ''}
                title={locked ? t('unlockAt', { n: need }) : undefined}
                onClick={() => update({ levelUpEffect: fx })}
              >
                {locked && <Icon name="lock" size={11} />}
                {t(EFFECT_KEY[fx])}
              </button>
            )
          })}
        </div>
      </SettingRow>
      <button className="btn small" onClick={() => setPreview(isUnlocked('effect', s.levelUpEffect, info.level) ? s.levelUpEffect : 'confetti')}>
        <Icon name="sparkle" size={14} />
        {t('previewLevelUp')}
      </button>
      {(
        [
          ['sendRipple', 'ripple', 'sendRipple'],
          ['aura', 'aura', 'auraOption'],
          ['rgbFrame', 'rgbFrame', 'rgbFrame']
        ] as const
      ).map(([key, id, label]) => {
        const need = unlockLevel('effect', id)
        const locked = info.level < need
        return (
          <SettingRow key={key} label={t(label)} hint={locked ? t('unlockAt', { n: need }) : undefined}>
            {locked ? (
              <Icon name="lock" size={16} />
            ) : (
              <Toggle label={t(label)} checked={s[key]} onChange={(v) => update({ [key]: v })} />
            )}
          </SettingRow>
        )
      })}

      <h4>{t('rewardsTitle')}</h4>
      <p className="muted small">{t('rewardsHint')}</p>
      <ol className="reward-road">
        {road.map(({ level, rewards }) => {
          const reached = info.level >= level
          const isNext = next?.level === level
          return (
            <li key={level} style={levelStyle(level)} className={`${reached ? 'reached' : ''} ${isNext ? 'next' : ''} ${levelClass(level)}`}>
              <span className="road-level">{reached ? <Icon name="check" size={13} /> : level}</span>
              <span className="road-items">
                {rewards.map((r) => (
                  <span key={r.kind + r.id} className={`road-item kind-${r.kind}`}>
                    <Icon name={KIND_ICON[r.kind]} size={13} />
                    {r.kind === 'accent' && r.id !== 'rgb' && <i className="road-swatch" style={{ background: r.id }} />}
                    {rewardName(r, lang)}
                  </span>
                ))}
              </span>
              <span className="muted small">
                {reached ? t('unlockedNow') : `${t('levelN', { n: level })} · ${compact(xpForLevel(level))} XP`}
              </span>
            </li>
          )
        })}
      </ol>

      <h4>{t('levelColors')}</h4>
      <p className="muted small">{t('levelColorsHint')}</p>
      <div className="level-grid">
        {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((n) => (
          <span
            key={n}
            className={`level-cell ${n <= info.level ? 'reached' : ''} ${n === info.level ? 'current' : ''} ${levelClass(n)} ${rewardsAt(n).length ? 'has-reward' : ''}`}
            style={levelStyle(n)}
            title={`${t('levelN', { n })} · ${t(TIER_KEY[tierOf(n)])} · ${compact(xpForLevel(n))} XP${rewardsAt(n).length ? ` · ${rewardsAt(n).map((r) => rewardName(r, lang)).join(', ')}` : ''}`}
          >
            {n}
          </span>
        ))}
      </div>
      <p className="muted small">{t('levelMore', { max: MAX_LEVEL })}</p>
      <button className="btn small ghost" onClick={reset}>
        {t('levelReset')}
      </button>
      {preview && <LevelUp level={info.level} effect={preview} onClose={() => setPreview(null)} />}
    </>
  )
}

/** Particles for each celebration style. */
function Celebration({ effect }: { effect: string }): ReactElement {
  const pieces = useMemo(
    () =>
      Array.from({ length: effect === 'fireworks' ? 40 : 30 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 8) * 0.13,
        hue: (i * 47) % 360,
        size: 6 + ((i * 13) % 12),
        angle: (i * 360) / (effect === 'fireworks' ? 20 : 30)
      })),
    [effect]
  )
  return (
    <div className={`celebrate fx-${effect}`} aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={i}
          style={
            {
              left: effect === 'fireworks' ? `${i < 20 ? 30 : 70}%` : `${p.left}%`,
              animationDelay: effect === 'fireworks' ? `${i < 20 ? 0 : 0.5}s` : `${p.delay}s`,
              ['--hue' as string]: p.hue,
              ['--a' as string]: `${p.angle}deg`,
              width: effect === 'bubbles' ? p.size : undefined,
              height: effect === 'bubbles' ? p.size : undefined
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

/** Celebration when a new level is reached, listing what it unlocked. */
export function LevelUp({ level, effect, onClose }: { level: number; effect?: string; onClose: () => void }): ReactElement {
  const { state } = useApp()
  const t = useT()
  const tier = tierOf(level)
  const chosen = effect ?? (isUnlocked('effect', state.settings.levelUpEffect, level) ? state.settings.levelUpEffect : 'confetti')
  const unlocked = rewardsAt(level)
  useEffect(() => {
    const timer = setTimeout(onClose, 7000)
    return () => clearTimeout(timer)
  }, [onClose])
  return (
    <div className="overlay levelup-overlay" onMouseDown={onClose}>
      <div className={`levelup ${levelClass(level)}`} style={levelStyle(level)} role="dialog" aria-live="polite" aria-label={t('levelUp')}>
        <Celebration effect={chosen} />
        {level >= MAX_LEVEL && <Sparkles count={16} />}
        <span className="levelup-kicker">{t('levelUp')}</span>
        <div className="levelup-number">{level}</div>
        <strong>{t(TIER_KEY[tier])}</strong>
        {unlocked.length > 0 && (
          <div className="levelup-rewards">
            <span className="muted small">{t('unlockedNow')}</span>
            {unlocked.map((r) => (
              <span key={r.kind + r.id} className="road-item">
                <Icon name={KIND_ICON[r.kind]} size={13} />
                {rewardName(r, state.settings.language)}
              </span>
            ))}
          </div>
        )}
        {iconsUnlockedAt(level).length > 0 && (
          <div className="levelup-rewards">
            <span className="muted small">{t('levelUpIcons')}</span>
            <div className="levelup-icons">
              {iconsUnlockedAt(level).map((d) => (
                <Star key={d.id} shape={d.id} level={level} size={30} />
              ))}
            </div>
          </div>
        )}
        <button className="btn primary" onClick={onClose}>
          {t('levelNice')}
        </button>
      </div>
    </div>
  )
}

/** Running RGB lights around the whole window (level 100 reward). */
export function RgbFrame(): ReactElement | null {
  const { state } = useApp()
  const level = levelFor(activeXp(state)).level
  if (!state.settings.rgbFrame || !isUnlocked('effect', 'rgbFrame', level)) return null
  return <div className="rgb-frame" aria-hidden="true" />
}
