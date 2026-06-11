FROM python:3.9

# Create a non-root user for security (required by Hugging Face)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# Copy and install requirements
COPY --chown=user:user requirements.txt $HOME/app/requirements.txt
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# Copy the rest of your project files
COPY --chown=user:user . $HOME/app

# Hugging Face requires port 7860 to expose the public URL
CMD ["uvicorn", "api.index:app", "--host", "0.0.0.0", "--port", "7860"]