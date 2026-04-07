export interface CommentMention {
  id: string
  label: string
}

export type CommentSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; text: string; userId: string }

const COMMENT_MENTION_REGEX = /@\[(.+?)\]\(([^)]+)\)/g

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function encodeCommentMentions(content: string, mentions: CommentMention[]) {
  let nextContent = content

  for (const mention of [...mentions].sort((left, right) => right.label.length - left.label.length)) {
    const mentionPattern = new RegExp(`(^|\\s)@${escapeRegExp(mention.label)}(?=\\s|$)`, 'g')
    nextContent = nextContent.replace(mentionPattern, (_match, leadingWhitespace: string) => {
      return `${leadingWhitespace}@[${mention.label}](${mention.id})`
    })
  }

  return nextContent
}

export function extractCommentMentionIds(content: string) {
  const ids = new Set<string>()

  for (const match of content.matchAll(COMMENT_MENTION_REGEX)) {
    ids.add(match[2])
  }

  return [...ids]
}

export function getCommentDisplayText(content: string) {
  return content.replace(COMMENT_MENTION_REGEX, (_match, label: string) => `@${label}`)
}

export function getCommentSegments(content: string): CommentSegment[] {
  const segments: CommentSegment[] = []
  let lastIndex = 0

  for (const match of content.matchAll(COMMENT_MENTION_REGEX)) {
    const index = match.index ?? 0

    if (index > lastIndex) {
      segments.push({ type: 'text', text: content.slice(lastIndex, index) })
    }

    segments.push({
      type: 'mention',
      text: `@${match[1]}`,
      userId: match[2],
    })
    lastIndex = index + match[0].length
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', text: content.slice(lastIndex) })
  }

  return segments
}
