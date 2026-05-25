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
  return (
    <img
      src={`https://api.dicebear.com/9.x/adventurer/svg?seed=${avatar}`}
      alt="avatar"
      className={`${className} object-contain rounded-full bg-white/5 border border-white/10 select-none`}
    />
  )
}
