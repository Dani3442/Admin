'use client'

import { useEffect, useState } from 'react'
import { cn, getUserInitials } from '@/lib/utils'

interface UserAvatarProps {
  user: {
    name?: string | null
    lastName?: string | null
    avatar?: string | null
  }
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeClasses = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-20 w-20 text-2xl',
}

export function UserAvatar({ user, size = 'md', className }: UserAvatarProps) {
  const [hasImageError, setHasImageError] = useState(false)

  useEffect(() => {
    setHasImageError(false)
  }, [user.avatar])

  if (user.avatar && !hasImageError) {
    return (
      <div className={cn('overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200', sizeClasses[size], className)}>
        <img
          src={user.avatar}
          alt="Аватар пользователя"
          className="h-full w-full object-cover"
          onError={() => setHasImageError(true)}
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-brand-600 font-semibold uppercase text-white ring-1 ring-brand-500/20',
        sizeClasses[size],
        className
      )}
    >
      {getUserInitials(user)}
    </div>
  )
}
