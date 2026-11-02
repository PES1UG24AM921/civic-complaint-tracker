'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Category = { category_id: number; name: string; department_name: string };

export default function NewComplaintPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState('');
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadCategories() {
      try {
        const response = await fetch('/api/complaints/categories');
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load categories.');
        setCategories(result);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load categories.');
      } finally {
        setLoadingCategories(false);
      }
    }
    void loadCategories();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.get('title'),
          category_id: form.get('category_id'),
          priority: form.get('priority'),
          description: form.get('description'),
          location: form.get('location'),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to submit complaint.');
      router.push(`/complaints/${result.complaint_id}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit complaint.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <header className="page-header">
        <h2>Raise a complaint</h2>
        <Link href="/complaints" className="button secondary">Back to complaints</Link>
      </header>

      <section className="panel">
        <form onSubmit={handleSubmit}>
          <label>
            Title
            <input name="title" type="text" placeholder="Briefly describe the issue" required minLength={5} maxLength={200} />
          </label>

          <label>
            Category
            <select name="category_id" defaultValue="" required disabled={loadingCategories || categories.length === 0}>
              <option value="" disabled>{loadingCategories ? 'Loading categories…' : 'Select a category'}</option>
              {categories.map((category) => (
                <option key={category.category_id} value={category.category_id}>
                  {category.department_name} — {category.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Priority
            <select name="priority" defaultValue="medium">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>

          <label>
            Location (optional)
            <input name="location" type="text" maxLength={300} placeholder="Street, neighborhood, or landmark" />
          </label>

          <label>
            Description
            <textarea name="description" placeholder="Describe the issue and its impact." required minLength={10} maxLength={5000} />
          </label>

          {error && (
            <div role="alert">
              <p className="tag danger">{error}</p>
              {error === 'Authentication required.' && <Link href="/login">Sign in to continue</Link>}
            </div>
          )}
          {categories.length === 0 && !loadingCategories && <p>No categories are available. Contact an administrator.</p>}
          <button type="submit" disabled={submitting || loadingCategories || categories.length === 0}>
            {submitting ? 'Submitting…' : 'Submit complaint'}
          </button>
        </form>
      </section>
    </main>
  );
}
