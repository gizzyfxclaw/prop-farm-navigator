const LOGO_SRC = "/gizzyfx-logo.png";

export function LogoMark({ size = 32 }: { size?: number }) {
  const w = Math.round(size * 1.97);
  return (
    <img src={LOGO_SRC} alt="GizzyFX" role="img" width={w} height={size} draggable={false}
      style={{ display: "block", flexShrink: 0, objectFit: "contain" }} />
  );
}

export function LogoWordmark({ height = 18 }: { height?: number }) {
  const w = Math.round(height * 1.97);
  return (
    <img src={LOGO_SRC} alt="GizzyFX" role="img" height={height} width={w} draggable={false}
      style={{ display: "block", objectFit: "contain" }} />
  );
}
