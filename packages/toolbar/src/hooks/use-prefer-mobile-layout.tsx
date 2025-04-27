import { useMediaQuery } from "@/hooks/use-media-query";

export const usePreferMobileLayout = () => useMediaQuery("(max-width: 768px)");
