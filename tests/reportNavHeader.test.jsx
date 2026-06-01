import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportNavHeader from '../src/components/ReportNavHeader';

describe('ReportNavHeader', () => {
  it('renders the center label and both aria-labels', () => {
    render(
      <ReportNavHeader
        onPrev={() => {}}
        onNext={() => {}}
        nextDisabled={false}
        prevLabel="Previous week"
        nextLabel="Next week"
      >
        Week label
      </ReportNavHeader>,
    );
    expect(screen.getByText('Week label')).toBeInTheDocument();
    expect(screen.getByLabelText('Previous week')).toBeInTheDocument();
    expect(screen.getByLabelText('Next week')).toBeInTheDocument();
  });

  it('fires onPrev / onNext when the chevrons are clicked', async () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(
      <ReportNavHeader
        onPrev={onPrev}
        onNext={onNext}
        nextDisabled={false}
        prevLabel="Previous week"
        nextLabel="Next week"
      >
        Label
      </ReportNavHeader>,
    );
    await userEvent.click(screen.getByLabelText('Previous week'));
    await userEvent.click(screen.getByLabelText('Next week'));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('disables the next button when nextDisabled is true', async () => {
    const onNext = vi.fn();
    render(
      <ReportNavHeader
        onPrev={() => {}}
        onNext={onNext}
        nextDisabled
        prevLabel="Previous week"
        nextLabel="Next week"
      >
        Label
      </ReportNavHeader>,
    );
    const nextBtn = screen.getByLabelText('Next week');
    expect(nextBtn).toBeDisabled();
    await userEvent.click(nextBtn);
    expect(onNext).not.toHaveBeenCalled();
  });
});
