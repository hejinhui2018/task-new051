import type { Issue } from '../lib/diagnostics';
import { issueCount } from '../lib/diagnostics';

interface IssuesPanelProps {
  issues: Issue[];
  onJump: (pageIndex: number) => void;
}

const TYPE_LABEL: Record<Issue['type'], string> = {
  missing: '缺页',
  duplicate: '重复页',
  inverted: '倒置',
  bleed: '出血不足',
  blank: '补白',
};

/** 版面问题清单：缺页 / 重复页 / 倒置 / 出血不足 / 补白提示 */
export function IssuesPanel({ issues, onJump }: IssuesPanelProps) {
  const counts = issueCount(issues);

  return (
    <section className="issues-panel">
      <header className="panel-head">
        <h2>版面检查</h2>
        <span className={`status-pill ${counts.error > 0 ? 'status-pill--bad' : 'status-pill--ok'}`}>
          {counts.error > 0 ? `${counts.error} 个错误` : '检查通过'}
        </span>
      </header>

      {issues.length === 0 ? (
        <p className="hint">暂无问题：页码连续、朝向正确、出血达标。</p>
      ) : (
        <ul className="issues-list">
          {issues.map((iss, k) => (
            <li key={k} className={`issue-row issue-row--${iss.level}`}>
              <span className={`issue-badge issue-badge--${iss.type}`}>{TYPE_LABEL[iss.type]}</span>
              <span className="issue-row__msg">{iss.message}</span>
              {iss.pageIndex >= 0 && (
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => onJump(iss.pageIndex)}
                >
                  查看第 {iss.pageIndex + 1} 帖位
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
