"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

interface CursorProps {
  size?: number;
}

export const Cursor: React.FC<CursorProps> = ({ size = 56 }) => {
  const cursorRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>();
  const previousPos = useRef({ x: -size, y: -size });
  const targetPos = useRef({ x: -size, y: -size });

  const [visible, setVisible] = useState(false);

  const animate = useCallback(() => {
    if (!cursorRef.current) return;

    const currentX = previousPos.current.x;
    const currentY = previousPos.current.y;
    const targetX = targetPos.current.x - size / 2;
    const targetY = targetPos.current.y - size / 2;

    const deltaX = (targetX - currentX) * 0.2;
    const deltaY = (targetY - currentY) * 0.2;

    const newX = currentX + deltaX;
    const newY = currentY + deltaY;

    previousPos.current = { x: newX, y: newY };
    cursorRef.current.style.transform = `translate(${newX}px, ${newY}px)`;

    requestRef.current = requestAnimationFrame(animate);
  }, [size]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setVisible(true);
      targetPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseEnter = () => {
      setVisible(true);
    };

    const handleMouseLeave = () => {
      setVisible(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.documentElement.addEventListener("mouseenter", handleMouseEnter);
    document.documentElement.addEventListener("mouseleave", handleMouseLeave);

    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "none";

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.documentElement.removeEventListener("mouseenter", handleMouseEnter);
      document.documentElement.removeEventListener("mouseleave", handleMouseLeave);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      document.body.style.cursor = previousCursor;
    };
  }, [animate]);

  return (
    <div
      ref={cursorRef}
      className="fixed pointer-events-none rounded-full bg-white mix-blend-difference z-50 ring-2 ring-white shadow-[0_0_14px_rgba(255,255,255,1),0_0_36px_rgba(255,255,255,0.95),0_0_64px_rgba(255,255,255,0.7)] brightness-150 contrast-150 transition-opacity duration-300"
      style={{
        width: size,
        height: size,
        opacity: visible ? 1 : 0,
      }}
      aria-hidden="true"
    />
  );
};

export default Cursor;
