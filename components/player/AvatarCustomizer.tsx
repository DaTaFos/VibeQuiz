'use client'

import { useState } from 'react'
import AvatarImage from '@/components/AvatarImage'
import { createClient } from '@/lib/supabase/client'
import { savePlayerSession } from '@/lib/session'

interface AvatarConfig {
  skinColor: string
  hair: string
  hairColor: string
  eyes: string
  eyebrows: string
  mouth: string
  glasses: string
  features: string
  earrings: string
}

const DEFAULT_CONFIG: AvatarConfig = {
  skinColor: 'f2d3b1',
  hair: 'short01',
  hairColor: '0e0e0e',
  eyes: 'variant01',
  eyebrows: 'variant01',
  mouth: 'variant01',
  glasses: 'none',
  features: 'none',
  earrings: 'none'
}

interface AvatarCustomizerProps {
  roomCode: string
  session: { playerId: string; name: string; avatar: string | null }
  onClose: () => void
  onSave: (newAvatar: string) => void
}

export default function AvatarCustomizer({ roomCode, session, onClose, onSave }: AvatarCustomizerProps) {
  const [config, setConfig] = useState<AvatarConfig>(() => deserializeConfig(session.avatar))
  const [loading, setLoading] = useState(false)

  // Options lists
  const SKIN_COLORS = ['f2d3b1', 'ecad80', '9e5622', '763900']
  
  const HAIR_STYLES = [
    'none', 'short01', 'short02', 'short03', 'short04', 'short05', 
    'short06', 'short08', 'short10', 'short12', 'short14', 'short16', 
    'short18', 'long01', 'long02', 'long03', 'long04', 'long05', 
    'long06', 'long08', 'long10', 'long12', 'long14', 'long16', 
    'long18', 'long20', 'long22', 'long24'
  ]
  
  const HAIR_COLORS = [
    '0e0e0e', '6a4e35', '796a45', 'b9a05f', 'e5d7a3', 'cb6820', 
    'ac6511', 'ab2a18', 'afafaf', '3eac2c', '85c2c6', 'dba3be', '592454'
  ]
  
  const EYES = [
    'variant01', 'variant02', 'variant03', 'variant04', 'variant05', 
    'variant06', 'variant07', 'variant08', 'variant09', 'variant10', 
    'variant11', 'variant12', 'variant14', 'variant16', 'variant18', 
    'variant20', 'variant22', 'variant24', 'variant26'
  ]
  
  const EYEBROWS = [
    'variant01', 'variant02', 'variant03', 'variant04', 'variant05', 
    'variant06', 'variant07', 'variant08', 'variant09', 'variant10', 
    'variant11', 'variant12', 'variant13', 'variant14', 'variant15'
  ]
  
  const MOUTHS = [
    'variant01', 'variant02', 'variant03', 'variant04', 'variant05', 
    'variant06', 'variant07', 'variant08', 'variant09', 'variant10', 
    'variant11', 'variant12', 'variant13', 'variant14', 'variant15', 
    'variant16', 'variant17', 'variant18', 'variant19', 'variant20', 
    'variant21', 'variant22', 'variant23', 'variant24', 'variant25', 
    'variant26', 'variant27', 'variant28', 'variant29', 'variant30'
  ]
  
  const GLASSES_STYLES = ['none', 'variant01', 'variant02', 'variant03', 'variant04', 'variant05']
  
  const FEATURES_STYLES = ['none', 'mustache', 'blush', 'birthmark', 'freckles']
  
  const EARRINGS_STYLES = ['none', 'variant01', 'variant02', 'variant03', 'variant04', 'variant05']

  // Previews helpers (isolated & transparent for focused display)
  const getHairPreview = (hair: string) => `https://api.dicebear.com/9.x/adventurer/svg?skinColor=transparent&hair=${hair}&hairColor=${config.hairColor}&glassesProbability=0&featuresProbability=0&earringsProbability=0`
  const getEyesPreview = (eyes: string) => `https://api.dicebear.com/9.x/adventurer/svg?skinColor=transparent&eyes=${eyes}&hairProbability=0&glassesProbability=0&featuresProbability=0&earringsProbability=0`
  const getEyebrowsPreview = (eyebrows: string) => `https://api.dicebear.com/9.x/adventurer/svg?skinColor=transparent&eyebrows=${eyebrows}&hairProbability=0&glassesProbability=0&featuresProbability=0&earringsProbability=0`
  const getMouthPreview = (mouth: string) => `https://api.dicebear.com/9.x/adventurer/svg?skinColor=transparent&mouth=${mouth}&hairProbability=0&glassesProbability=0&featuresProbability=0&earringsProbability=0`
  const getGlassesPreview = (glasses: string) => `https://api.dicebear.com/9.x/adventurer/svg?skinColor=transparent&glasses=${glasses}&glassesProbability=100&hairProbability=0&featuresProbability=0&earringsProbability=0`
  const getFeaturesPreview = (feature: string) => `https://api.dicebear.com/9.x/adventurer/svg?skinColor=transparent&features=${feature}&featuresProbability=100&hairProbability=0&glassesProbability=0&earringsProbability=0`
  const getEarringsPreview = (earring: string) => `https://api.dicebear.com/9.x/adventurer/svg?skinColor=transparent&earrings=${earring}&earringsProbability=100&hairProbability=0&glassesProbability=0&featuresProbability=0`

  const handleRandomize = () => {
    setConfig({
      skinColor: SKIN_COLORS[Math.floor(Math.random() * SKIN_COLORS.length)],
      hair: HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)],
      hairColor: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)],
      eyes: EYES[Math.floor(Math.random() * EYES.length)],
      eyebrows: EYEBROWS[Math.floor(Math.random() * EYEBROWS.length)],
      mouth: MOUTHS[Math.floor(Math.random() * MOUTHS.length)],
      glasses: GLASSES_STYLES[Math.floor(Math.random() * GLASSES_STYLES.length)],
      features: FEATURES_STYLES[Math.floor(Math.random() * FEATURES_STYLES.length)],
      earrings: EARRINGS_STYLES[Math.floor(Math.random() * EARRINGS_STYLES.length)]
    })
  }

  const handleSave = async () => {
    setLoading(true)
    const supabase = createClient()
    const serialized = serializeConfig(config)
    
    // Save to database
    const { data } = await supabase.rpc('join_room', {
      p_room_code: roomCode,
      p_name: session.name,
      p_avatar: serialized,
    })

    if (data?.success) {
      // Update local storage session
      savePlayerSession({
        playerId: session.playerId,
        roomCode: roomCode,
        name: session.name,
        avatar: serialized,
      })

      // Trigger parent callback
      onSave(serialized)

      // Broadcast update via /api/broadcast
      try {
        await fetch('/api/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomCode,
            payload: {
              type: 'PLAYER_AVATAR_CHANGED',
              playerId: session.playerId,
              avatar: serialized
            }
          })
        })
      } catch (err) {
        console.error('Failed to broadcast avatar change:', err)
      }

      onClose()
    }
    setLoading(false)
  }

  const activeAvatarString = serializeConfig(config)

  return (
    <div className="fixed inset-0 bg-gray-950/98 backdrop-blur-md z-50 flex flex-col md:flex-row animate-fade-in overflow-hidden">
      {/* LEFT SECTION: PREVIEW */}
      <div className="w-full md:w-2/5 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-white/10 p-6 md:p-10 select-none bg-gradient-to-b md:bg-gradient-to-r from-white/[0.02] to-transparent">
        <h3 className="text-xl font-black text-gray-400 mb-6 uppercase tracking-wider">Avatar Preview</h3>
        
        {/* Glowing circular preview container */}
        <div className="relative flex items-center justify-center w-48 h-48 md:w-64 md:h-64 rounded-full bg-white/5 border border-white/10 shadow-2xl overflow-hidden mb-8 ring-4 ring-brand-500/10">
          <AvatarImage avatar={activeAvatarString} className="w-40 h-40 md:w-56 md:h-56 animate-bounce-in" />
        </div>

        <button
          type="button"
          onClick={handleRandomize}
          className="btn-secondary px-8 py-3 flex items-center gap-2 active:scale-95 transition-all cursor-pointer shadow-lg hover:shadow-white/5"
        >
          <span className="text-xl">🎲</span>
          <span className="font-bold">Randomize Face</span>
        </button>
      </div>

      {/* RIGHT SECTION: CUSTOMIZATION CONTROLS */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-white">Customize Adventurer</h2>
            <p className="text-sm text-gray-400">Tailor your lobby avatar details</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-lg active:scale-90 transition-all cursor-pointer"
            title="Close Customizer"
          >
            ✕
          </button>
        </div>

        {/* Scrollable controls panel */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 select-none">
          {/* SKIN TONE */}
          <div>
            <h4 className="text-sm font-black text-gray-300 uppercase tracking-wider mb-3">Skin Tone</h4>
            <div className="flex flex-wrap gap-3">
              {SKIN_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setConfig({ ...config, skinColor: color })}
                  style={{ backgroundColor: `#${color}` }}
                  className={`w-14 h-14 rounded-full border-2 transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                    config.skinColor === color ? 'border-white ring-4 ring-brand-500 scale-105 shadow-lg shadow-brand-500/20' : 'border-white/10 hover:border-white/20'
                  }`}
                  title="Skin Tone Swatch"
                />
              ))}
            </div>
          </div>

          {/* HAIR STYLE */}
          <div>
            <h4 className="text-sm font-black text-gray-300 uppercase tracking-wider mb-3">Hair Style</h4>
            <div className="flex flex-wrap gap-3">
              {HAIR_STYLES.map((hair) => (
                <button
                  key={hair}
                  onClick={() => setConfig({ ...config, hair })}
                  className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden border bg-white/5 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                    config.hair === hair ? 'border-brand-400 bg-brand-500/10 scale-105 shadow-md shadow-brand-500/10' : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  {hair === 'none' ? (
                    <div className="text-lg font-black text-gray-400">None</div>
                  ) : (
                    <img src={getHairPreview(hair)} className="w-16 h-16 md:w-20 md:h-20 object-contain" alt="Hair Style" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* HAIR COLOR */}
          {config.hair !== 'none' && (
            <div>
              <h4 className="text-sm font-black text-gray-300 uppercase tracking-wider mb-3">Hair Color</h4>
              <div className="flex flex-wrap gap-3">
                {HAIR_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setConfig({ ...config, hairColor: color })}
                    style={{ backgroundColor: `#${color}` }}
                    className={`w-12 h-12 rounded-full border-2 transition-all hover:scale-110 active:scale-95 cursor-pointer ${
                      config.hairColor === color ? 'border-white ring-4 ring-brand-400 scale-110 shadow-lg shadow-brand-500/20' : 'border-white/10 hover:border-white/25'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* EYES */}
          <div>
            <h4 className="text-sm font-black text-gray-300 uppercase tracking-wider mb-3">Eyes</h4>
            <div className="flex flex-wrap gap-3">
              {EYES.map((eyesVal) => (
                <button
                  key={eyesVal}
                  onClick={() => setConfig({ ...config, eyes: eyesVal })}
                  className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden border bg-white/5 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                    config.eyes === eyesVal ? 'border-brand-400 bg-brand-500/10 scale-105 shadow-md shadow-brand-500/10' : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <img src={getEyesPreview(eyesVal)} className="w-16 h-16 md:w-20 md:h-20 object-contain" alt="Eyes Style" />
                </button>
              ))}
            </div>
          </div>

          {/* EYEBROWS */}
          <div>
            <h4 className="text-sm font-black text-gray-300 uppercase tracking-wider mb-3">Eyebrows</h4>
            <div className="flex flex-wrap gap-3">
              {EYEBROWS.map((eyebrowsVal) => (
                <button
                  key={eyebrowsVal}
                  onClick={() => setConfig({ ...config, eyebrows: eyebrowsVal })}
                  className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden border bg-white/5 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                    config.eyebrows === eyebrowsVal ? 'border-brand-400 bg-brand-500/10 scale-105 shadow-md shadow-brand-500/10' : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <img src={getEyebrowsPreview(eyebrowsVal)} className="w-16 h-16 md:w-20 md:h-20 object-contain" alt="Eyebrows Style" />
                </button>
              ))}
            </div>
          </div>

          {/* MOUTH */}
          <div>
            <h4 className="text-sm font-black text-gray-300 uppercase tracking-wider mb-3">Mouth</h4>
            <div className="flex flex-wrap gap-3">
              {MOUTHS.map((mouthVal) => (
                <button
                  key={mouthVal}
                  onClick={() => setConfig({ ...config, mouth: mouthVal })}
                  className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden border bg-white/5 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                    config.mouth === mouthVal ? 'border-brand-400 bg-brand-500/10 scale-105 shadow-md shadow-brand-500/10' : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <img src={getMouthPreview(mouthVal)} className="w-16 h-16 md:w-20 md:h-20 object-contain" alt="Mouth Style" />
                </button>
              ))}
            </div>
          </div>

          {/* GLASSES */}
          <div>
            <h4 className="text-sm font-black text-gray-300 uppercase tracking-wider mb-3">Glasses</h4>
            <div className="flex flex-wrap gap-3">
              {GLASSES_STYLES.map((glassesVal) => (
                <button
                  key={glassesVal}
                  onClick={() => setConfig({ ...config, glasses: glassesVal })}
                  className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden border bg-white/5 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                    config.glasses === glassesVal ? 'border-brand-400 bg-brand-500/10 scale-105 shadow-md shadow-brand-500/10' : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  {glassesVal === 'none' ? (
                    <div className="text-lg font-black text-gray-400">None</div>
                  ) : (
                    <img src={getGlassesPreview(glassesVal)} className="w-16 h-16 md:w-20 md:h-20 object-contain" alt="Glasses Style" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* SPECIAL FEATURES */}
          <div>
            <h4 className="text-sm font-black text-gray-300 uppercase tracking-wider mb-3">Special Features</h4>
            <div className="flex flex-wrap gap-3">
              {FEATURES_STYLES.map((featureVal) => (
                <button
                  key={featureVal}
                  onClick={() => setConfig({ ...config, features: featureVal })}
                  className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden border bg-white/5 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                    config.features === featureVal ? 'border-brand-400 bg-brand-500/10 scale-105 shadow-md shadow-brand-500/10' : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  {featureVal === 'none' ? (
                    <div className="text-lg font-black text-gray-400">None</div>
                  ) : (
                    <img src={getFeaturesPreview(featureVal)} className="w-16 h-16 md:w-20 md:h-20 object-contain" alt="Features Style" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* EARRINGS */}
          <div>
            <h4 className="text-sm font-black text-gray-300 uppercase tracking-wider mb-3">Earrings</h4>
            <div className="flex flex-wrap gap-3">
              {EARRINGS_STYLES.map((earringVal) => (
                <button
                  key={earringVal}
                  onClick={() => setConfig({ ...config, earrings: earringVal })}
                  className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden border bg-white/5 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                    config.earrings === earringVal ? 'border-brand-400 bg-brand-500/10 scale-105 shadow-md shadow-brand-500/10' : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  {earringVal === 'none' ? (
                    <div className="text-lg font-black text-gray-400">None</div>
                  ) : (
                    <img src={getEarringsPreview(earringVal)} className="w-16 h-16 md:w-20 md:h-20 object-contain" alt="Earrings Style" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer controls */}
        <div className="px-6 py-5 border-t border-white/10 bg-white/[0.01] flex items-center justify-end gap-3 select-none">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-6 py-3 border border-white/15 hover:bg-white/5 text-white font-semibold rounded-xl active:scale-95 transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="btn-primary px-8 py-3 font-semibold rounded-xl active:scale-95 cursor-pointer"
          >
            {loading ? 'Saving…' : 'Save Avatar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Helper serializations
function serializeConfig(config: AvatarConfig): string {
  const parts = []
  parts.push(`skinColor=${config.skinColor}`)
  if (config.hair && config.hair !== 'none') {
    parts.push(`hair=${config.hair}`)
    parts.push(`hairColor=${config.hairColor}`)
    parts.push('hairProbability=100')
  } else {
    parts.push('hairProbability=0')
  }
  parts.push(`eyes=${config.eyes}`)
  parts.push(`eyebrows=${config.eyebrows}`)
  parts.push(`mouth=${config.mouth}`)
  
  if (config.glasses && config.glasses !== 'none') {
    parts.push(`glasses=${config.glasses}`)
    parts.push('glassesProbability=100')
  } else {
    parts.push('glassesProbability=0')
  }
  
  if (config.features && config.features !== 'none') {
    parts.push(`features=${config.features}`)
    parts.push('featuresProbability=100')
  } else {
    parts.push('featuresProbability=0')
  }
  
  if (config.earrings && config.earrings !== 'none') {
    parts.push(`earrings=${config.earrings}`)
    parts.push('earringsProbability=100')
  } else {
    parts.push('earringsProbability=0')
  }
  
  return `adventurer:${parts.join('&')}`
}

function deserializeConfig(avatarStr: string | null): AvatarConfig {
  const config = { ...DEFAULT_CONFIG }
  if (!avatarStr || !avatarStr.startsWith('adventurer:')) {
    // Graceful micah to adventurer conversion if someone loads a legacy micah config
    if (avatarStr && avatarStr.startsWith('micah:')) {
      const query = avatarStr.substring(6)
      const pairs = query.split('&')
      for (const pair of pairs) {
        const [key, val] = pair.split('=')
        if (key && val) {
          if (key === 'baseColor') {
            if (val === 'ffdbb4') config.skinColor = 'f2d3b1'
            else if (val === 'edb98a') config.skinColor = 'ecad80'
            else if (val === '75311b') config.skinColor = '763900'
            else config.skinColor = 'ecad80'
          } else if (key === 'hair') {
            if (val === 'mrClean' || val === 'none') {
              config.hair = 'none'
            } else {
              config.hair = val.startsWith('short') ? val : 'short01'
            }
          } else if (key === 'hairColor') {
            config.hairColor = val
          } else if (key === 'glasses') {
            config.glasses = val === 'none' ? 'none' : 'variant01'
          } else if (key === 'facialHair') {
            if (val === 'beard') config.features = 'mustache'
          }
        }
      }
    }
    return config
  }
  
  const query = avatarStr.substring('adventurer:'.length)
  const pairs = query.split('&')
  for (const pair of pairs) {
    const [key, val] = pair.split('=')
    if (key && val) {
      if (key === 'hairProbability' && val === '0') {
        config.hair = 'none'
      } else if (key === 'glassesProbability' && val === '0') {
        config.glasses = 'none'
      } else if (key === 'featuresProbability' && val === '0') {
        config.features = 'none'
      } else if (key === 'earringsProbability' && val === '0') {
        config.earrings = 'none'
      } else if (
        key === 'hair' || 
        key === 'hairColor' || 
        key === 'skinColor' || 
        key === 'eyes' || 
        key === 'eyebrows' || 
        key === 'mouth' || 
        key === 'glasses' || 
        key === 'features' || 
        key === 'earrings'
      ) {
        ;(config as any)[key] = val
      }
    }
  }
  return config
}
