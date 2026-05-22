import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import QuizBuilder from '@/components/host/QuizBuilder'

export default async function EditQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: quiz } = await supabase
    .from('quizzes')
    .select('*')
    .eq('id', id)
    .single()

  if (!quiz) notFound()

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('quiz_id', id)
    .order('position')

  return (
    <QuizBuilder
      mode="edit"
      quizId={id}
      initialTitle={quiz.title}
      initialDescription={quiz.description ?? ''}
      initialQuestions={questions ?? []}
    />
  )
}
