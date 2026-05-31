import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import HostGame from '@/components/host/HostGame'

export default async function HostLobbyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // Create or get room for this quiz
  const { data: roomData } = await supabase.rpc('create_room', { p_quiz_id: id })

  if (!roomData?.success) notFound()

  // Fetch room details
  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomData.room_id)
    .single()

  if (!room) notFound()

  // Fetch questions for this quiz
  const { data: questions } = await supabase
    .from('questions')
    .select('id, quiz_id, position, text, time_limit, max_points, option_a, option_b, option_c, option_d, image_url')
    // NOTE: correct_option deliberately excluded from select — it will not be passed to client
    .eq('quiz_id', id)
    .order('position')

  if (!questions?.length) notFound()

  return (
    <main className="min-h-screen">
      <HostGame initialRoom={room} questions={questions} />
    </main>
  )
}
