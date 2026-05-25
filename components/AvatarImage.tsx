'use client'

interface AvatarImageProps {
  avatar: string | null
  className?: string
}

export default function AvatarImage({ avatar, className = "w-6 h-6" }: AvatarImageProps) {
  if (!avatar) {
    return <span className="text-lg select-none">😶</span>
  }

  // Check if the avatar is an emoji (legacy emojis have a length <= 2)
  const isEmoji = avatar.length <= 2

  if (isEmoji) {
    return <span className="text-lg select-none">{avatar}</span>
  }

  // Otherwise, it's a premium DiceBear vector avatar seed!
  let url = `https://api.dicebear.com/9.x/adventurer/svg`

  if (avatar.startsWith('adventurer:')) {
    const query = avatar.substring('adventurer:'.length)
    url = `${url}?${query}`
  } else if (avatar.startsWith('micah:')) {
    // Graceful backward compatibility mapping micah options to adventurer parameters
    const query = avatar.substring('micah:'.length)
    const params = new URLSearchParams(query)
    const newParams = new URLSearchParams()
    
    // Skin Tone
    const baseColor = params.get('baseColor')
    if (baseColor) {
      // Map micah skin color to nearest adventurer skin color
      if (baseColor === 'ffdbb4') newParams.set('skinColor', 'f2d3b1')
      else if (baseColor === 'edb98a') newParams.set('skinColor', 'ecad80')
      else if (baseColor === '75311b') newParams.set('skinColor', '763900')
      else newParams.set('skinColor', 'ecad80')
    }

    // Hair Style and Probability
    const hair = params.get('hair')
    if (hair && hair !== 'mrClean' && hair !== 'none') {
      newParams.set('hair', 'short01')
      newParams.set('hairProbability', '100')
      const hairColor = params.get('hairColor')
      if (hairColor) newParams.set('hairColor', hairColor)
    } else {
      newParams.set('hairProbability', '0')
    }

    // Glasses
    const glasses = params.get('glasses')
    if (glasses && glasses !== 'none') {
      newParams.set('glasses', 'variant01')
      newParams.set('glassesProbability', '100')
    } else {
      newParams.set('glassesProbability', '0')
    }

    // Beard to Features
    const facialHair = params.get('facialHair')
    if (facialHair && facialHair === 'beard') {
      newParams.set('features', 'mustache')
      newParams.set('featuresProbability', '100')
    } else {
      newParams.set('featuresProbability', '0')
    }

    // Default eyes, eyebrows, mouth for legacy translation
    newParams.set('eyes', 'variant01')
    newParams.set('eyebrows', 'variant01')
    newParams.set('mouth', 'variant01')

    url = `${url}?${newParams.toString()}`
  } else {
    url = `${url}?seed=${encodeURIComponent(avatar)}`
  }

  return (
    <img
      src={url}
      alt="avatar"
      className={`${className} object-contain rounded-full bg-white/5 border border-white/10 select-none`}
    />
  )
}

