import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Quiz } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: quizzes } = await supabase
    .from('quizzes')
    .select('*')
    .order('updated_at', { ascending: false })

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold">Your Quizzes</h1>
          <p className="text-gray-400 mt-1">{quizzes?.length ?? 0} quiz{quizzes?.length !== 1 ? 'zes' : ''}</p>
        </div>
        <Link href="/host/quiz/new" className="btn-primary" id="new-quiz-btn">
          + New Quiz
        </Link>
      </div>

      {quizzes?.length === 0 && (
        <div className="glass-card p-12 text-center animate-fade-in">
          <div className="text-5xl mb-4">🎯</div>
          <h2 className="text-xl font-bold mb-2">No quizzes yet</h2>
          <p className="text-gray-400 mb-6">Create your first quiz to get started.</p>
          <Link href="/host/quiz/new" className="btn-primary inline-block">
            Create a Quiz
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {quizzes?.map((quiz: Quiz) => (
          <QuizCard key={quiz.id} quiz={quiz} />
        ))}
      </div>
    </main>
  )
}

function QuizCard({ quiz }: { quiz: Quiz }) {
  return (
    <div className="glass-card p-6 hover:bg-white/10 transition-colors group animate-fade-in">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg truncate">{quiz.title}</h2>
          {quiz.description && (
            <p className="text-gray-400 text-sm mt-1 line-clamp-2">{quiz.description}</p>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-5">
        Updated {new Date(quiz.updated_at).toLocaleDateString()}
      </p>

      <div className="flex gap-2 flex-wrap">
        <Link
          href={`/host/quiz/${quiz.id}/edit`}
          className="btn-secondary text-sm py-2 px-4"
          id={`edit-quiz-${quiz.id}`}
        >
          ✏️ Edit
        </Link>
        <Link
          href={`/host/quiz/${quiz.id}/lobby`}
          className="btn-primary text-sm py-2 px-4"
          id={`host-quiz-${quiz.id}`}
        >
          🚀 Host
        </Link>
      </div>
    </div>
  )
}
