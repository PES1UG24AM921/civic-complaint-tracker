export default function NewComplaintPage() {
  return (
    <main className="shell">
      <header className="page-header">
        <h2>Raise a complaint</h2>
      </header>

      <section className="panel">
        <form>
          <label>
            Title
            <input type="text" placeholder="Describe the issue" />
          </label>

          <label>
            Category
            <select defaultValue="roads">
              <option value="roads">Roads & infrastructure</option>
              <option value="water">Water supply</option>
              <option value="sanitation">Sanitation</option>
            </select>
          </label>

          <label>
            Priority
            <select defaultValue="medium">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>

          <label>
            Description
            <textarea placeholder="Add property or locality details, urgency, and specific issue." />
          </label>

          <button type="submit">Submit complaint</button>
        </form>
      </section>
    </main>
  );
}
