"""Simple fine-tuning script for testing COCO format compatibility with ML frameworks."""

import os
import json
from pathlib import Path
from typing import Optional

# Fix OpenMP library conflict on macOS
# This is a common issue when multiple libraries link different OpenMP runtimes
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

try:
    import torch
    from torch.utils.data import Dataset
    from torchvision import transforms
    from PIL import Image
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    # Define dummy classes for type hints when torch is not available
    Dataset = object
    transforms = None

DATA_DIR = Path(__file__).parent.parent / "data"
COCO_FILE = DATA_DIR / "annotations.json"
TILES_DIR = DATA_DIR / "tiles"


def load_coco_annotations(coco_file: Path = COCO_FILE) -> dict:
    """Load COCO format annotations from JSON file."""
    if not coco_file.exists():
        raise FileNotFoundError(f"COCO annotations file not found: {coco_file}")
    
    with open(coco_file, "r") as f:
        return json.load(f)


def find_tiles_directory() -> Optional[Path]:
    """Find the tiles directory (may be nested under tile_server_id)."""
    if not TILES_DIR.exists():
        return None
    
    # Check if tiles are directly in tiles/ or nested under a tile_server_id
    subdirs = [d for d in TILES_DIR.iterdir() if d.is_dir()]
    if len(subdirs) == 1:
        # Assume tiles are in the single subdirectory
        return subdirs[0]
    elif len(subdirs) == 0:
        # Tiles might be directly in tiles/
        return TILES_DIR
    else:
        # Multiple subdirs - use the first one
        return subdirs[0]


if TORCH_AVAILABLE:
    class COCODataset(Dataset):
        """PyTorch Dataset for COCO format annotations.
        
        Compatible with torchvision and detectron2-style training pipelines.
        """
        
        def __init__(
            self,
            coco_file: Path = COCO_FILE,
            tiles_dir: Optional[Path] = None,
            transform: Optional[transforms.Compose] = None,
        ):
            """Initialize COCO dataset.
            
            Args:
                coco_file: Path to COCO annotations JSON file
                tiles_dir: Path to tiles directory (auto-detected if None)
                transform: Optional torchvision transforms to apply
            """
            if not TORCH_AVAILABLE:
                raise ImportError("PyTorch and torchvision are required. Install with: pip install torch torchvision")
            
            self.coco_data = load_coco_annotations(coco_file)
            self.tiles_dir = tiles_dir or find_tiles_directory()
            
            if self.tiles_dir is None:
                raise ValueError(f"Tiles directory not found. Expected at: {TILES_DIR}")
            
            # Build image_id -> image mapping
            self.images = {img["id"]: img for img in self.coco_data["images"]}
            
            # Build image_id -> annotations mapping
            self.image_annotations = {}
            for ann in self.coco_data["annotations"]:
                image_id = ann["image_id"]
                if image_id not in self.image_annotations:
                    self.image_annotations[image_id] = []
                self.image_annotations[image_id].append(ann)
            
            # Create list of image IDs
            self.image_ids = list(self.images.keys())
            
            # Default transform: convert to tensor and normalize
            self.transform = transform or transforms.Compose([
                transforms.ToTensor(),
            ])
        
        def __len__(self) -> int:
            """Return number of images in dataset."""
            return len(self.image_ids)
        
        def __getitem__(self, idx: int) -> dict:
            """Get image and annotations for a given index.
            
            Returns:
                Dictionary with:
                    - image: PIL Image or torch.Tensor (depending on transform)
                    - image_id: int
                    - annotations: list of annotation dicts
                    - boxes: torch.Tensor of shape [N, 4] (x, y, w, h)
                    - labels: torch.Tensor of shape [N] (category_ids)
            """
            image_id = self.image_ids[idx]
            image_info = self.images[image_id]
            
            # Load image
            image_path = self.tiles_dir / image_info["file_name"]
            if not image_path.exists():
                # Try without tiles/ prefix if file_name includes it
                image_path = self.tiles_dir / Path(image_info["file_name"]).name
            
            image = Image.open(image_path).convert("RGB")
            
            # Get annotations for this image
            annotations = self.image_annotations.get(image_id, [])
            
            # Extract boxes and labels
            boxes = []
            labels = []
            for ann in annotations:
                # COCO bbox format: [x, y, width, height]
                boxes.append(ann["bbox"])
                labels.append(ann["category_id"])
            
            # Apply transform
            if self.transform:
                image = self.transform(image)
            
            # Convert boxes to tensor
            boxes_tensor = torch.tensor(boxes, dtype=torch.float32) if boxes else torch.zeros((0, 4))
            labels_tensor = torch.tensor(labels, dtype=torch.int64) if labels else torch.zeros((0,), dtype=torch.int64)
            
            return {
                "image": image,
                "image_id": image_id,
                "annotations": annotations,
                "boxes": boxes_tensor,
                "labels": labels_tensor,
            }
else:
    # Dummy class when torch is not available
    class COCODataset:
        def __init__(self, *args, **kwargs):
            raise ImportError("PyTorch and torchvision are required. Install with: pip install torch torchvision")


def print_dataset_info():
    """Print information about the dataset."""
    try:
        coco_data = load_coco_annotations()
        
        print(f"Dataset Info:")
        print(f"  Description: {coco_data.get('info', {}).get('description', 'N/A')}")
        print(f"  Number of images: {len(coco_data['images'])}")
        print(f"  Number of annotations: {len(coco_data['annotations'])}")
        print(f"  Number of categories: {len(coco_data['categories'])}")
        print(f"\nCategories:")
        for cat in coco_data["categories"]:
            print(f"    {cat['id']}: {cat['name']}")
        
        # Count annotations per image
        if coco_data["annotations"]:
            anns_per_image = {}
            for ann in coco_data["annotations"]:
                img_id = ann["image_id"]
                anns_per_image[img_id] = anns_per_image.get(img_id, 0) + 1
            
            avg_anns = sum(anns_per_image.values()) / len(anns_per_image) if anns_per_image else 0
            print(f"\n  Average annotations per image: {avg_anns:.2f}")
            print(f"  Images with annotations: {len(anns_per_image)}/{len(coco_data['images'])}")
        
        # Check tiles directory
        tiles_dir = find_tiles_directory()
        if tiles_dir:
            tile_files = list(tiles_dir.glob("*.png"))
            print(f"\nTiles directory: {tiles_dir}")
            print(f"  Found {len(tile_files)} PNG files")
        else:
            print(f"\nTiles directory not found at: {TILES_DIR}")
        
    except FileNotFoundError as e:
        print(f"Error: {e}")
        print(f"\nMake sure you have exported COCO annotations first.")
        print(f"Expected file: {COCO_FILE}")


def test_dataset():
    """Test loading the dataset."""
    if not TORCH_AVAILABLE:
        print("PyTorch not available. Install with: pip install torch torchvision pillow")
        return
    
    try:
        dataset = COCODataset()
        print(f"\nDataset loaded successfully!")
        print(f"  Dataset size: {len(dataset)} images")
        
        if len(dataset) > 0:
            # Test loading first sample
            sample = dataset[0]
            print(f"\nSample data:")
            print(f"  Image shape: {sample['image'].shape if isinstance(sample['image'], torch.Tensor) else sample['image'].size}")
            print(f"  Image ID: {sample['image_id']}")
            print(f"  Number of annotations: {len(sample['annotations'])}")
            print(f"  Boxes shape: {sample['boxes'].shape}")
            print(f"  Labels shape: {sample['labels'].shape}")
            
            if len(sample['annotations']) > 0:
                print(f"\n  First annotation:")
                ann = sample['annotations'][0]
                print(f"    bbox: {ann['bbox']}")
                print(f"    category_id: {ann['category_id']}")
                if 'noun_phrase' in ann:
                    print(f"    noun_phrase: {ann['noun_phrase']}")
        
    except Exception as e:
        print(f"Error loading dataset: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    print("=" * 60)
    print("COCO Dataset Fine-tuning Script")
    print("=" * 60)
    
    print_dataset_info()
    
    if TORCH_AVAILABLE:
        print("\n" + "=" * 60)
        test_dataset()
    else:
        print("\nPyTorch not available. Install with: pip install torch torchvision pillow")
        print("Dataset class is still compatible with other frameworks that support COCO format.")
