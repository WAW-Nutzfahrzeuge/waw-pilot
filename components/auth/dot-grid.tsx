"use client";

import { useRef, useEffect, useCallback, useMemo } from "react";
import gsap from "gsap";

type DotGridProps = {
    dotSize?: number;
    gap?: number;
    baseColor?: string;
    activeColor?: string;
    proximity?: number;
    speedTrigger?: number;
    shockRadius?: number;
    shockStrength?: number;
    maxSpeed?: number;
    resistance?: number;
    returnDuration?: number;
    className?: string;
    style?: React.CSSProperties;
};

type Dot = {
    cx: number;
    cy: number;
    xOffset: number;
    yOffset: number;
    isAnimating: boolean;
};

function throttle<T extends (...args: never[]) => void>(func: T, limit: number) {
    let lastCall = 0;

    return function throttled(this: unknown, ...args: Parameters<T>) {
        const now = performance.now();

        if (now - lastCall >= limit) {
            lastCall = now;
            func.apply(this, args);
        }
    };
}

function prefersReducedMotion(): boolean {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return false;
    }

    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function hexToRgb(hex: string) {
    const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);

    if (!match) {
        return { r: 0, g: 0, b: 0 };
    }

    return {
        r: Number.parseInt(match[1], 16),
        g: Number.parseInt(match[2], 16),
        b: Number.parseInt(match[3], 16),
    };
}

export function DotGrid({
                            dotSize = 5,
                            gap = 15,
                            baseColor = "#155e75",
                            activeColor = "#ffffff",
                            proximity = 120,
                            speedTrigger = 100,
                            shockRadius = 250,
                            shockStrength = 5,
                            maxSpeed = 5000,
                            resistance = 700,
                            returnDuration = 2,
                            className = "",
                            style,
                        }: DotGridProps) {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const dotsRef = useRef<Dot[]>([]);
    const pointerRef = useRef({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        speed: 0,
        lastTime: 0,
        lastX: 0,
        lastY: 0,
    });

    const baseRgb = useMemo(() => hexToRgb(baseColor), [baseColor]);
    const activeRgb = useMemo(() => hexToRgb(activeColor), [activeColor]);

    const buildGrid = useCallback(() => {
        const wrapper = wrapperRef.current;
        const canvas = canvasRef.current;

        if (!wrapper || !canvas) return;

        const { width, height } = wrapper.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const context = canvas.getContext("2d");

        if (context) {
            context.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        const columns = Math.floor((width + gap) / (dotSize + gap));
        const rows = Math.floor((height + gap) / (dotSize + gap));
        const cell = dotSize + gap;

        const gridWidth = cell * columns - gap;
        const gridHeight = cell * rows - gap;

        const extraX = width - gridWidth;
        const extraY = height - gridHeight;

        const startX = extraX / 2 + dotSize / 2;
        const startY = extraY / 2 + dotSize / 2;

        const dots: Dot[] = [];

        for (let y = 0; y < rows; y += 1) {
            for (let x = 0; x < columns; x += 1) {
                dots.push({
                    cx: startX + x * cell,
                    cy: startY + y * cell,
                    xOffset: 0,
                    yOffset: 0,
                    isAnimating: false,
                });
            }
        }

        dotsRef.current = dots;
    }, [dotSize, gap]);

    useEffect(() => {
        let rafId = 0;
        const proximitySquared = proximity * proximity;
        // Dekoratives Hintergrund-Grid: bei reduzierter Bewegung nur einmal
        // statisch zeichnen statt endlos per requestAnimationFrame zu laufen.
        const reduceMotion = prefersReducedMotion();

        const draw = () => {
            const canvas = canvasRef.current;

            if (!canvas) return;

            const context = canvas.getContext("2d");

            if (!context) return;

            const rect = canvas.getBoundingClientRect();

            context.clearRect(0, 0, rect.width, rect.height);

            const { x: pointerX, y: pointerY } = pointerRef.current;

            for (const dot of dotsRef.current) {
                const ox = dot.cx + dot.xOffset;
                const oy = dot.cy + dot.yOffset;
                const dx = dot.cx - pointerX;
                const dy = dot.cy - pointerY;
                const distanceSquared = dx * dx + dy * dy;

                let fillStyle = baseColor;

                if (distanceSquared <= proximitySquared) {
                    const distance = Math.sqrt(distanceSquared);
                    const t = 1 - distance / proximity;

                    const r = Math.round(baseRgb.r + (activeRgb.r - baseRgb.r) * t);
                    const g = Math.round(baseRgb.g + (activeRgb.g - baseRgb.g) * t);
                    const b = Math.round(baseRgb.b + (activeRgb.b - baseRgb.b) * t);

                    fillStyle = `rgb(${r},${g},${b})`;
                }

                context.beginPath();
                context.arc(ox, oy, dotSize / 2, 0, Math.PI * 2);
                context.fillStyle = fillStyle;
                context.fill();
            }

            if (!reduceMotion) {
                rafId = requestAnimationFrame(draw);
            }
        };

        draw();

        return () => cancelAnimationFrame(rafId);
    }, [proximity, baseColor, activeRgb, baseRgb, dotSize]);

    useEffect(() => {
        buildGrid();

        const wrapper = wrapperRef.current;
        let resizeObserver: ResizeObserver | null = null;
        let usesWindowResize = false;

        if (typeof ResizeObserver !== "undefined" && wrapper) {
            resizeObserver = new ResizeObserver(() => {
                buildGrid();
            });

            resizeObserver.observe(wrapper);
        } else {
            usesWindowResize = true;
            globalThis.addEventListener("resize", buildGrid);
        }

        return () => {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            if (usesWindowResize) {
                globalThis.removeEventListener("resize", buildGrid);
            }
        };
    }, [buildGrid]);

    useEffect(() => {
        // Die Push-/Shock-Animationen beim Bewegen/Klicken sind rein
        // dekorativ und werden bei reduzierter Bewegung gar nicht erst
        // registriert (die statische Punktegrafik bleibt sichtbar).
        if (prefersReducedMotion()) {
            return;
        }

        const pushDot = (dot: Dot, pushX: number, pushY: number) => {
            dot.isAnimating = true;
            gsap.killTweensOf(dot);

            gsap.to(dot, {
                xOffset: pushX,
                yOffset: pushY,
                duration: Math.max(0.12, resistance / 2200),
                ease: "power3.out",
                onComplete: () => {
                    gsap.to(dot, {
                        xOffset: 0,
                        yOffset: 0,
                        duration: returnDuration,
                        ease: "elastic.out(1, 0.75)",
                        onComplete: () => {
                            dot.isAnimating = false;
                        },
                    });
                },
            });
        };

        const onMove = (event: MouseEvent) => {
            const canvas = canvasRef.current;

            if (!canvas) return;

            const now = performance.now();
            const pointer = pointerRef.current;
            const deltaTime = pointer.lastTime ? now - pointer.lastTime : 16;
            const dx = event.clientX - pointer.lastX;
            const dy = event.clientY - pointer.lastY;

            let vx = (dx / deltaTime) * 1000;
            let vy = (dy / deltaTime) * 1000;
            let speed = Math.hypot(vx, vy);

            if (speed > maxSpeed) {
                const scale = maxSpeed / speed;
                vx *= scale;
                vy *= scale;
                speed = maxSpeed;
            }

            pointer.lastTime = now;
            pointer.lastX = event.clientX;
            pointer.lastY = event.clientY;
            pointer.vx = vx;
            pointer.vy = vy;
            pointer.speed = speed;

            const rect = canvas.getBoundingClientRect();

            pointer.x = event.clientX - rect.left;
            pointer.y = event.clientY - rect.top;

            for (const dot of dotsRef.current) {
                const distance = Math.hypot(dot.cx - pointer.x, dot.cy - pointer.y);

                if (speed > speedTrigger && distance < proximity && !dot.isAnimating) {
                    const pushX = (dot.cx - pointer.x + vx * 0.005) * 0.5;
                    const pushY = (dot.cy - pointer.y + vy * 0.005) * 0.5;

                    pushDot(dot, pushX, pushY);
                }
            }
        };

        const onClick = (event: MouseEvent) => {
            const canvas = canvasRef.current;

            if (!canvas) return;

            const rect = canvas.getBoundingClientRect();
            const clickX = event.clientX - rect.left;
            const clickY = event.clientY - rect.top;

            for (const dot of dotsRef.current) {
                const distance = Math.hypot(dot.cx - clickX, dot.cy - clickY);

                if (distance < shockRadius && !dot.isAnimating) {
                    const falloff = Math.max(0, 1 - distance / shockRadius);
                    const pushX = (dot.cx - clickX) * shockStrength * falloff;
                    const pushY = (dot.cy - clickY) * shockStrength * falloff;

                    pushDot(dot, pushX, pushY);
                }
            }
        };

        const throttledMove = throttle(onMove as (...args: never[]) => void, 50) as unknown as (
            event: MouseEvent,
        ) => void;

        window.addEventListener("mousemove", throttledMove, { passive: true });
        window.addEventListener("click", onClick);

        return () => {
            window.removeEventListener("mousemove", throttledMove);
            window.removeEventListener("click", onClick);
        };
    }, [
        maxSpeed,
        speedTrigger,
        proximity,
        resistance,
        returnDuration,
        shockRadius,
        shockStrength,
    ]);

    return (
        <section className={`dot-grid ${className}`} style={style}>
            <div ref={wrapperRef} className="dot-grid__wrap">
                <canvas ref={canvasRef} className="dot-grid__canvas" />
            </div>
        </section>
    );
}