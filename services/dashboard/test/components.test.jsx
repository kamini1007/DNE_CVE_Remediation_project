import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SeverityBadge } from '../src/components/SeverityBadge';
import { CveTable } from '../src/components/CveTable';
import { FeedbackWidget } from '../src/components/FeedbackWidget';
import { feedbackApi } from '../src/api/feedbackApi';

vi.mock('../src/api/feedbackApi', () => ({
  feedbackApi: { submit: vi.fn() },
}));

describe('SeverityBadge', () => {
  it('renders the human-readable label for each level', () => {
    render(<SeverityBadge level="CRITICAL" />);
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('falls back to Unknown for an unrecognized level rather than rendering raw input', () => {
    render(<SeverityBadge level="NOT_A_REAL_LEVEL" />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('handles a null level without crashing', () => {
    render(<SeverityBadge level={null} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});

describe('CveTable', () => {
  const rows = [
    { cveId: 'CVE-2024-0001', riskLevel: 'CRITICAL', riskScore: 95.5, computedAt: '2024-03-15T10:30:00Z' },
    { cveId: 'CVE-2024-0002', riskLevel: 'HIGH', riskScore: 72.0, computedAt: '2024-03-15T10:30:00Z' },
  ];

  it('renders a row per CVE with its score', () => {
    render(<CveTable rows={rows} onSelect={() => {}} />);

    expect(screen.getByText('CVE-2024-0001')).toBeInTheDocument();
    expect(screen.getByText('CVE-2024-0002')).toBeInTheDocument();
    expect(screen.getByText('95.5')).toBeInTheDocument();
  });

  it('calls onSelect with the CVE ID when a row is clicked', () => {
    const onSelect = vi.fn();
    render(<CveTable rows={rows} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('CVE-2024-0001'));
    expect(onSelect).toHaveBeenCalledWith('CVE-2024-0001');
  });

  it('shows a helpful empty state rather than a blank table', () => {
    render(<CveTable rows={[]} onSelect={() => {}} />);
    expect(screen.getByText(/No scored CVEs yet/i)).toBeInTheDocument();
  });
});

describe('FeedbackWidget', () => {
  it('submits a rating and shows a confirmation, without a comment field', async () => {
    feedbackApi.submit.mockResolvedValue({ id: 1 });
    render(<FeedbackWidget cveId="CVE-2024-1" feedbackType="RISK_ACCURACY" label="Was this accurate?" />);

    expect(screen.getByText('Was this accurate?')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Rate 4 out of 5'));

    await waitFor(() => {
      expect(feedbackApi.submit).toHaveBeenCalledWith({
        cveId: 'CVE-2024-1',
        feedbackType: 'RISK_ACCURACY',
        rating: 4,
      });
    });
    await waitFor(() => expect(screen.getByText(/Thanks - feedback recorded/i)).toBeInTheDocument());
  });

  it('shows an error message rather than silently failing when submission fails', async () => {
    feedbackApi.submit.mockRejectedValue(new Error('Network error'));
    render(<FeedbackWidget cveId="CVE-2024-2" feedbackType="ANALYSIS_ACCURACY" label="Accurate?" />);

    fireEvent.click(screen.getByLabelText('Rate 2 out of 5'));

    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
    expect(screen.queryByText(/Thanks - feedback recorded/i)).not.toBeInTheDocument();
  });
});
