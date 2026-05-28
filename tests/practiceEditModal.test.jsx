// tests/practiceEditModal.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PracticeEditModal from '../src/components/PracticeEditModal';

vi.mock('../src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key) => key }),
}));

const fundamentals = [
  { id: 1, uid: 'uid-1', name: 'Paradiddle', category: 'fundamentals', trashed: false, archived: false },
];
const songs = [
  { id: 2, uid: 'uid-2', name: 'Song A', category: 'songs', trashed: false, archived: false },
];
const mockItems = [...fundamentals, ...songs];

const basePractice = {
  name: 'Test',
  startBpm: 80,
  endBpm: 120,
  bpmIncrement: 5,
  barsPerStep: 4,
  timeSignature: { beats: 4, noteValue: 4 },
  subdivision: 'quarter',
  soundType: 'click',
  linkedItemUid: null,
};

describe('PracticeEditModal — linked practice item dropdown', () => {
  it('renders a dropdown with None option and practice items', () => {
    render(
      <PracticeEditModal
        practice={null}
        items={mockItems}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const select = screen.getByRole('combobox');
    expect(select).toBeTruthy();
    expect(screen.getByText('practiceMode.linkedItemNone')).toBeTruthy();
    expect(screen.getByText('Paradiddle')).toBeTruthy();
    expect(screen.getByText('Song A')).toBeTruthy();
  });

  it('onSave receives linkedItemUid null when None is selected (default)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <PracticeEditModal
        practice={null}
        items={mockItems}
        onSave={onSave}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    await user.type(screen.getByPlaceholderText('practiceMode.namePlaceholder'), 'Test');
    await user.click(screen.getByText('done'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ linkedItemUid: null }));
  });

  it('onSave receives the selected item uid', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <PracticeEditModal
        practice={null}
        items={mockItems}
        onSave={onSave}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    await user.type(screen.getByPlaceholderText('practiceMode.namePlaceholder'), 'Test');
    await user.selectOptions(screen.getByRole('combobox'), 'uid-1');
    await user.click(screen.getByText('done'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ linkedItemUid: 'uid-1' }));
  });

  it('pre-selects the saved linkedItemUid when editing', () => {
    render(
      <PracticeEditModal
        practice={{ ...basePractice, linkedItemUid: 'uid-2' }}
        items={mockItems}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const select = screen.getByRole('combobox');
    expect(select.value).toBe('uid-2');
  });

  it('shows stale warning when savedlinkedItemUid is not in items', () => {
    render(
      <PracticeEditModal
        practice={{ ...basePractice, linkedItemUid: 'gone-uid' }}
        items={mockItems}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('practiceMode.linkedItemNotFound')).toBeTruthy();
  });
});
