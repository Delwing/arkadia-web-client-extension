import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePlayerGender } from './hooks/usePlayerGender';
import { colorString, createColorFormat } from '@modules/core/Colors';
import type { TransportRoutePayload, TransportTimerPayload } from '@client/types/transport';

const POPUP_ID = 'popup:transport-route';

function formatTime(seconds: number | null): string {
    if (seconds === null) {
        return '?';
    }
    const total = Math.floor(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

interface GraphEdge {
    nodeA: string;
    nodeB: string;
    forwardDuration: number | null;
    backwardDuration: number | null;
    forwardStopIndexes: number[];
    backwardStopIndexes: number[];
}

interface RouteGraph {
    nodes: string[];
    edges: GraphEdge[];
    /** Maps each linear stop index to { edgeIndex, direction } */
    stopToEdge: Map<number, { edgeIndex: number; direction: 'forward' | 'backward' }>;
    /** Maps node label to all linear stop indexes that arrive at that node */
    nodeToStopIndexes: Map<string, number[]>;
}

function buildGraph(route: TransportRoutePayload): RouteGraph {
    const nodes: string[] = [];
    const edges: GraphEdge[] = [];
    const stopToEdge = new Map<number, { edgeIndex: number; direction: 'forward' | 'backward' }>();
    const nodeToStopIndexes = new Map<string, number[]>();

    // Build sequence of locations visited
    const sequence = [route.originLabel, ...route.stops.map(s => s.label)];

    // Collect unique nodes in order of first appearance
    for (const label of sequence) {
        if (!nodes.includes(label)) {
            nodes.push(label);
        }
    }

    // Build edges from consecutive pairs (stop i goes from sequence[i] to sequence[i+1])
    for (let i = 0; i < route.stops.length; i++) {
        const from = sequence[i];
        const to = sequence[i + 1];
        const duration = route.stops[i].durationSeconds;

        // Track which stop indexes arrive at each node
        const existing = nodeToStopIndexes.get(to);
        if (existing) {
            existing.push(i);
        } else {
            nodeToStopIndexes.set(to, [i]);
        }

        // Find existing edge between these two nodes (in either direction)
        let edgeIndex = edges.findIndex(e => e.nodeA === from && e.nodeB === to);
        if (edgeIndex !== -1) {
            // Same direction edge already exists (rare case)
            edges[edgeIndex].forwardStopIndexes.push(i);
            stopToEdge.set(i, { edgeIndex, direction: 'forward' });
            continue;
        }

        edgeIndex = edges.findIndex(e => e.nodeA === to && e.nodeB === from);
        if (edgeIndex !== -1) {
            // Reverse direction — mark as bidirectional
            edges[edgeIndex].backwardDuration = duration;
            edges[edgeIndex].backwardStopIndexes.push(i);
            stopToEdge.set(i, { edgeIndex, direction: 'backward' });
            continue;
        }

        // New edge
        const newEdge: GraphEdge = {
            nodeA: from,
            nodeB: to,
            forwardDuration: duration,
            backwardDuration: null,
            forwardStopIndexes: [i],
            backwardStopIndexes: [],
        };
        edges.push(newEdge);
        stopToEdge.set(i, { edgeIndex: edges.length - 1, direction: 'forward' });
    }

    return { nodes, edges, stopToEdge, nodeToStopIndexes };
}

const TransportRoutePopup: React.FC = () => {
    const { wrapperProps } = usePopup(POPUP_ID, {
        openEvent: 'transport.popup.open',
    });

    const gender = usePlayerGender();
    const [route, setRoute] = useState<TransportRoutePayload | null>(null);
    const [timer, setTimer] = useState<TransportTimerPayload | null>(null);
    const [alertNodeLabel, setAlertNodeLabel] = useState<string | null>(null);
    const [arrivedNodeLabel, setArrivedNodeLabel] = useState<string | null>(null);
    const [currentNodeLabel, setCurrentNodeLabel] = useState<string | null>(null);
    const routeRef = useRef<TransportRoutePayload | null>(null);
    const graph = useMemo(() => route ? buildGraph(route) : null, [route]);

    useEffect(() => {
        return eventBus.on('transportRoute', (data) => {
            routeRef.current = data;
            setRoute(data);
            if (!data) {
                setAlertNodeLabel(null);
                setArrivedNodeLabel(null);
                setCurrentNodeLabel(null);
            }
        });
    }, []);

    useEffect(() => {
        return eventBus.on('transportTimer', (data) => {
            setTimer(data);
        });
    }, []);

    useEffect(() => {
        return eventBus.on('transportArrival', (stopIndex) => {
            const nodeLabel = routeRef.current?.stops[stopIndex]?.label ?? null;
            setCurrentNodeLabel(nodeLabel);

            if (!alertNodeLabel || !graph) return;
            const stopIndexes = graph.nodeToStopIndexes.get(alertNodeLabel);
            if (stopIndexes && stopIndexes.includes(stopIndex)) {
                const stopLabel = nodeLabel ?? alertNodeLabel;
                const verb = gender === 'female' ? 'Dotarlas' : 'Dotarles';
                eventBus.emit('notify', { text: `${verb} do: ${stopLabel}` });
                const ARRIVAL_COLOR = createColorFormat('#00cc66');
                eventBus.emit('printLine', colorString(`${verb} do: ${stopLabel}`, ARRIVAL_COLOR));
                setArrivedNodeLabel(alertNodeLabel);
            }
        });
    }, [alertNodeLabel, graph, route, gender]);

    // Determine which edge + direction is active
    const activeEdgeInfo = useMemo(() => {
        if (!graph || route?.activeStopIndex === undefined || !route.onBoard) return null;
        return graph.stopToEdge.get(route.activeStopIndex) ?? null;
    }, [graph, route?.activeStopIndex, route?.onBoard]);

    // Clear current node and arrived flash when transport departs
    useEffect(() => {
        return eventBus.on('transportDeparture', () => {
            setCurrentNodeLabel(null);
            setArrivedNodeLabel(null);
        });
    }, []);

    const handleNodeClick = useCallback((label: string) => {
        setArrivedNodeLabel(null);
        setAlertNodeLabel(prev => prev === label ? null : label);
    }, []);

    const title = route ? `Trasa: ${route.transportName}` : 'Trasa';

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="transport-route"
            title={title}
            minWidth={250}
            minHeight={200}
            initialWidth={300}
            className="transport-route-popup"
            bodyClassName="transport-route-popup-body"
        >
            {!route || !graph ? (
                <div className="transport-route-popup__empty">
                    Brak aktywnej trasy
                </div>
            ) : (
                <div className="transport-graph">
                    {graph.nodes.map((nodeLabel, nodeIndex) => {
                        const isActive = currentNodeLabel === nodeLabel;
                        const isAlert = alertNodeLabel === nodeLabel;
                        const isArrived = arrivedNodeLabel === nodeLabel;

                        const nodeClasses = [
                            'transport-graph__node',
                            isActive ? 'transport-graph__node--active' : '',
                            isAlert ? 'transport-graph__node--alert' : '',
                            isArrived ? 'transport-graph__node--arrived' : '',
                        ].filter(Boolean).join(' ');

                        // Find edge from this node to the next node in the list
                        const edge = graph.edges.find(e =>
                            (e.nodeA === nodeLabel && graph.nodes.indexOf(e.nodeB) === nodeIndex + 1) ||
                            (e.nodeB === nodeLabel && graph.nodes.indexOf(e.nodeA) === nodeIndex + 1)
                        );

                        // Determine if edge is flipped (nodeB comes first in node order)
                        const edgeFlipped = edge ? edge.nodeB === nodeLabel : false;

                        let edgeActive = false;
                        let edgeDirection: 'forward' | 'backward' | null = null;
                        if (edge && activeEdgeInfo) {
                            const edgeIndex = graph.edges.indexOf(edge);
                            if (edgeIndex === activeEdgeInfo.edgeIndex) {
                                edgeActive = true;
                                edgeDirection = activeEdgeInfo.direction;
                            }
                        }

                        // Resolve display times for this edge
                        // "downward" = from this node to the next node in visual order
                        // "upward" = from the next node back to this node
                        let downTime: number | null = null;
                        let upTime: number | null = null;
                        let downStopIndexes: number[] = [];
                        let upStopIndexes: number[] = [];
                        if (edge) {
                            if (!edgeFlipped) {
                                downTime = edge.forwardDuration;
                                upTime = edge.backwardDuration;
                                downStopIndexes = edge.forwardStopIndexes;
                                upStopIndexes = edge.backwardStopIndexes;
                            } else {
                                downTime = edge.backwardDuration;
                                upTime = edge.forwardDuration;
                                downStopIndexes = edge.backwardStopIndexes;
                                upStopIndexes = edge.forwardStopIndexes;
                            }
                        }

                        // If active, show countdown on the active direction
                        const activeGoingDown = edgeActive && (
                            (!edgeFlipped && edgeDirection === 'forward') ||
                            (edgeFlipped && edgeDirection === 'backward')
                        );
                        const activeGoingUp = edgeActive && (
                            (!edgeFlipped && edgeDirection === 'backward') ||
                            (edgeFlipped && edgeDirection === 'forward')
                        );

                        const displayDownTime = activeGoingDown && timer !== null ? timer.remaining : downTime;
                        const displayUpTime = activeGoingUp && timer !== null ? timer.remaining : upTime;

                        const isTraveling = edgeActive && currentNodeLabel === null;
                        const edgeClasses = edge ? [
                            'transport-graph__edge',
                            edgeActive ? 'transport-graph__edge--active' : '',
                            isTraveling ? 'transport-graph__edge--traveling' : '',
                        ].filter(Boolean).join(' ') : '';

                        return (
                            <React.Fragment key={nodeLabel}>
                                <div
                                    className={nodeClasses}
                                    onClick={() => handleNodeClick(nodeLabel)}
                                >
                                    <span className="transport-graph__node-dot">
                                        {isActive ? '\u25CF' : '\u25CB'}
                                    </span>
                                    <span className="transport-graph__node-label">{nodeLabel}</span>
                                    {isAlert && (
                                        <span className="transport-graph__alert-icon">&#128276;</span>
                                    )}
                                </div>
                                {edge && (
                                    <div className={edgeClasses}>
                                        <div className="transport-graph__edge-line" />
                                        <div className="transport-graph__edge-times">
                                            {downTime !== null && (
                                                <span className={`transport-graph__edge-time${activeGoingDown ? ' transport-graph__edge-time--active' : ''}`}>
                                                    &#8595; {formatTime(displayDownTime)}
                                                </span>
                                            )}
                                            {upTime !== null && (
                                                <span className={`transport-graph__edge-time${activeGoingUp ? ' transport-graph__edge-time--active' : ''}`}>
                                                    &#8593; {formatTime(displayUpTime)}
                                                </span>
                                            )}
                                            {downTime !== null && upTime === null && !downStopIndexes.length && upStopIndexes.length > 0 && (
                                                <span className={`transport-graph__edge-time${activeGoingUp ? ' transport-graph__edge-time--active' : ''}`}>
                                                    &#8593; {formatTime(displayUpTime)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            )}
        </DockablePopupWrapper>
    );
};

export default TransportRoutePopup;
