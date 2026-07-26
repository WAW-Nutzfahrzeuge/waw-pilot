FROM maven:3.9.9-eclipse-temurin-21 AS build

WORKDIR /app
COPY pom.xml .
RUN mvn -B dependency:go-offline

COPY src ./src
RUN mvn -B package -DskipTests

FROM eclipse-temurin:21-jre-noble

ARG VERAPDF_VERSION=1.30.2
ARG VERAPDF_MINOR=1.30

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        ghostscript \
        icc-profiles-free \
        unzip \
    && rm -rf /var/lib/apt/lists/*

COPY verapdf-auto-install.xml /tmp/verapdf-auto-install.xml

RUN curl -fsSL "https://software.verapdf.org/rel/${VERAPDF_MINOR}/verapdf-greenfield-${VERAPDF_VERSION}-installer.zip" -o /tmp/verapdf-installer.zip \
    && unzip /tmp/verapdf-installer.zip -d /tmp/verapdf-installer \
    && chmod +x "/tmp/verapdf-installer/verapdf-greenfield-${VERAPDF_VERSION}/verapdf-install" \
    && "/tmp/verapdf-installer/verapdf-greenfield-${VERAPDF_VERSION}/verapdf-install" /tmp/verapdf-auto-install.xml \
    && ln -s /opt/verapdf/verapdf /usr/local/bin/verapdf \
    && rm -rf /tmp/verapdf-installer /tmp/verapdf-installer.zip /tmp/verapdf-auto-install.xml

WORKDIR /app

RUN groupadd --system app \
    && useradd --system --gid app --home-dir /app --shell /usr/sbin/nologin app \
    && chown app:app /app /tmp

COPY --from=build --chown=app:app /app/target/zugferd-service-0.1.0.jar /app/zugferd-service.jar

ENV PORT=8080
ENV GHOSTSCRIPT_COMMAND=gs
ENV VERAPDF_COMMAND=verapdf
ENV ICC_PROFILE_PATH=/usr/share/color/icc/ghostscript/srgb.icc

EXPOSE 8080

USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS "http://localhost:${PORT:-8080}/health" >/dev/null || exit 1

ENTRYPOINT ["java", "-jar", "/app/zugferd-service.jar"]
