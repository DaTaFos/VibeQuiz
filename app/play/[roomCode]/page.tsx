import PlayerGame from '@/components/player/PlayerGame'

export default async function PlayRoomPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params
  return <PlayerGame roomCode={roomCode} />
}
