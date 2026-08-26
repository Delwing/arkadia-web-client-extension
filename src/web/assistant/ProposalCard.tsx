import { useMemo, useState } from 'react';
import type { AssistantProposal, ValidationResult } from '@modules/core/assistant/proposalValidator.ts';
import { applyProposal } from './applyProposal';
import { describeProposal } from './describeProposal';

/**
 * Confirm/reject card for one validated proposal.
 *
 * Three things have to be visible before the user can reasonably click
 * "Zastosuj":
 *
 * - **What changes**, in Polish prose, not JSON.
 * - **What the validator repaired.** The commonest defect is a Polish letter
 *   inside a regex, which the validator folds rather than rejecting (a weak
 *   model will only repeat the mistake). A silent fold would mean the user
 *   applies a pattern they never saw.
 * - **Command flags**, prominently. These mark commands that drop, destroy,
 *   give away or sell items, move money, end the session or wipe client data.
 *   The validator deliberately flags rather than strips: the user decides.
 */
export interface ProposalCardProps {
    result: ValidationResult;
    /** Called after a successful apply, with the confirmation text. */
    onApplied?: (message: string) => void;
}

export default function ProposalCard({ result, onApplied }: ProposalCardProps) {
    const proposal = result.proposal as AssistantProposal | undefined;
    const [state, setState] = useState<'pending' | 'applied' | 'rejected' | 'failed'>('pending');
    const [feedback, setFeedback] = useState('');

    const description = useMemo(
        () => (proposal ? describeProposal(proposal) : null),
        [proposal],
    );

    if (!proposal || !description) return null;

    // A proposal that sets the value it already has. It validates, so it gets
    // this far, but as a card it is a button that visibly does nothing. The
    // answer prose above it already says whatever needed saying.
    if (description.noChange) return null;

    const warnings = [
        ...result.issues.filter(issue => issue.severity === 'warning').map(issue => issue.message),
        ...description.warnings,
    ];

    const handleApply = () => {
        const outcome = applyProposal(proposal);
        setFeedback(outcome.message);
        setState(outcome.ok ? 'applied' : 'failed');
        if (outcome.ok) onApplied?.(outcome.message);
    };

    return (
        <div className={`assistant-card assistant-card--${state}`}>
            <div className="assistant-card__title">{description.title}</div>

            {proposal.reason && (
                <div className="assistant-card__reason">{proposal.reason}</div>
            )}

            <dl className="assistant-card__rows">
                {description.rows.map(row => (
                    <div className="assistant-card__row" key={row.label}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                    </div>
                ))}
            </dl>

            {result.commandFlags.length > 0 && (
                <div className="assistant-card__flags">
                    <div className="assistant-card__flags-title">Uwaga - sprawdz te komende:</div>
                    <ul>
                        {result.commandFlags.map((flag, index) => (
                            <li key={`${flag.code}-${index}`}>
                                {flag.message} <code>{flag.match}</code>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {result.repairs.length > 0 && (
                <div className="assistant-card__repairs">
                    <div className="assistant-card__repairs-title">Poprawiono automatycznie:</div>
                    <ul>
                        {result.repairs.map((repair, index) => (
                            <li key={`${repair.code}-${index}`}>
                                {repair.message}
                                <div className="assistant-card__diff">
                                    <code>{repair.from}</code>
                                    {' -> '}
                                    <code>{repair.to}</code>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {warnings.length > 0 && (
                <ul className="assistant-card__warnings">
                    {warnings.map((warning, index) => <li key={index}>{warning}</li>)}
                </ul>
            )}

            {state === 'pending' ? (
                <div className="assistant-card__actions">
                    <button type="button" className="assistant-btn assistant-btn--primary" onClick={handleApply}>
                        Zastosuj
                    </button>
                    <button type="button" className="assistant-btn" onClick={() => setState('rejected')}>
                        Odrzuc
                    </button>
                </div>
            ) : (
                <div className="assistant-card__status">
                    {state === 'rejected' ? 'Odrzucono.' : feedback}
                </div>
            )}
        </div>
    );
}
